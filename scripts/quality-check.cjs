#!/usr/bin/env node
// このプロジェクト固有の品質チェック。
// 共通チェック（scripts/harness-check.cjs）はハーネスが持っている。ここには
// 言語・スタックに依存するものだけを置く。
//
// Gradle も npm もホストには入れない前提なので、起動中のコンテナの中で走らせる。
//
// 終了コード: 0 合格 / 1 指摘あり / 3 環境の問題で実行できない
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKEND = 'raise-timeline-backend';
const FRONTEND = 'raise-timeline-frontend';
const DB = 'raise-timeline-db';

const TAIL_LINES = 100;

// docker と git は実体のある実行ファイルで、.cmd のシムではないので、シェルを通さずに起動する。
// maxBuffer を外すのは、正当だが長い出力で子プロセスが打ち切られ、通るはずの検査が落ちたことになるのを防ぐため。
// spawn の失敗とシグナルでの終了は、検査の結果ではないので reason に分けて返す。
function run(cmd, args) {
	const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: Infinity });
	let reason = '';
	if (r.error) reason = r.error.message;
	else if (r.signal) reason = `signal ${r.signal}`;
	return {
		ok: !r.error && r.status === 0,
		status: r.status,
		reason,
		stdout: (r.stdout || '').trim(),
		stderr: (r.stderr || '').trim(),
		out: `${r.stdout || ''}${r.stderr || ''}`.trim(),
	};
}

// 環境の問題。コードを直しても解決しないので、指摘（1）とは別の終了コードで返す。
function envError(...lines) {
	for (const line of lines) process.stderr.write(`${line}\n`);
	process.exit(3);
}

// --- 環境の確認 ---
const top = run('git', ['rev-parse', '--show-toplevel']);
if (!top.ok) envError('git リポジトリの中で実行してください。');
const root = top.stdout;

// git-dir は cwd からの相対で返ることがあるので、絶対パスにしてから比べる。
const gitDir = path.resolve(run('git', ['rev-parse', '--git-dir']).stdout);
const commonDir = path.resolve(run('git', ['rev-parse', '--git-common-dir']).stdout);
if (gitDir !== commonDir) {
	envError(
		'git の worktree の中からは検査できません。コンテナがマウントしているのはメインの作業ディレクトリです。メインの作業ディレクトリで実行してください。',
	);
}
process.chdir(root);

if (!run('docker', ['version']).ok) {
	envError('docker を実行できません。Docker を起動してから、もう一度実行してください。');
}

// 足りないものは全部調べてからまとめて報告する。
const notRunning = [BACKEND, FRONTEND, DB].filter(
	(name) => run('docker', ['inspect', '-f', '{{.State.Running}}', name]).stdout !== 'true',
);
if (notRunning.length > 0) {
	envError(
		...notRunning.map((name) => `コンテナ ${name} が起動していません。`),
		'docker compose up -d を実行してから、もう一度実行してください。',
	);
}

if (run('docker', ['inspect', '-f', '{{.State.Health.Status}}', DB]).stdout !== 'healthy') {
	envError('db がまだ healthy ではありません。少し待ってから、もう一度実行してください。');
}

// --- 検査 ---
function dockerExec(container, ...cmd) {
	return ['exec', '-w', '/workspace', container, ...cmd];
}

const checks = [
	{
		name: 'backend (gradlew check)',
		args: dockerExec(BACKEND, './gradlew', 'check', '--console=plain'),
		spotbugs: true,
	},
	{ name: 'frontend (lint)', args: dockerExec(FRONTEND, 'npm', 'run', 'lint') },
	{ name: 'frontend (typecheck)', args: dockerExec(FRONTEND, 'npm', 'run', 'typecheck') },
	{ name: 'frontend (test)', args: dockerExec(FRONTEND, 'npm', 'test') },
];

function tail(text) {
	return text.split('\n').slice(-TAIL_LINES).join('\n');
}

// 今回の実行で落ちた SpotBugs のタスクだけ、レポートを出す。build/ は名前付きボリュームなので、
// 前回のレポートが残っている。spotbugs まで進まずに落ちたときに出すと、直した指摘を追わせてしまう。
function printSpotbugsReports(output) {
	for (const m of output.matchAll(/^> Task :spotbugs(\w+) FAILED$/gm)) {
		const sourceSet = m[1].toLowerCase();
		const report = run(
			'docker',
			dockerExec(BACKEND, 'sh', '-c', `cat build/reports/spotbugs/${sourceSet}.txt 2>/dev/null`),
		).stdout;
		if (report) process.stdout.write(`\n[SpotBugs レポート: ${sourceSet}]\n${report}\n`);
	}
}

// 一時停止中のコンテナへの docker exec は、125 ではなく 1 で終わる（Docker 28 で確認）。
// 検査の 1 と見分けるため、daemon が返すエラーの書き出しで判定する。
function isDaemonError(r) {
	return !r.ok && r.stderr.startsWith('Error response from daemon:');
}

// 1つ落ちても残りを走らせ、最後にまとめて出す。
// docker exec 自体の失敗（終了コード 125。コンテナが検査の途中で止まった等）と、起動の失敗・シグナルでの終了は、
// 検査の結果ではなく環境の問題。指摘として出すと、存在しない指摘を直しに行かせる。
const results = [];
for (const check of checks) {
	const started = Date.now();
	const r = run('docker', check.args);
	const seconds = ((Date.now() - started) / 1000).toFixed(1);

	if (r.reason || r.status === 125 || isDaemonError(r)) {
		const reason = r.reason || `docker exec が終了コード ${r.status} で失敗しました`;
		process.stderr.write(`\n${check.name} を実行できませんでした（環境の問題）: ${reason}\n`);
		if (r.out) process.stderr.write(`${tail(r.out)}\n`);
		results.push({ name: check.name, state: 'env', seconds });
		continue;
	}

	results.push({ name: check.name, state: r.ok ? 'ok' : 'ng', seconds });
	if (r.ok) continue;

	process.stdout.write(`\n[NG] ${check.name}\n${tail(r.out)}\n`);
	if (check.spotbugs) printSpotbugsReports(r.out);
}

const LABEL = { ok: 'OK', ng: 'NG', env: '環境' };
process.stdout.write('\n');
for (const r of results) {
	process.stdout.write(`[${LABEL[r.state]}] ${r.name} (${r.seconds}s)\n`);
}

// process.exit は書き残しを捨てる（Linux のパイプは非同期なので、長い出力の末尾が消える）。終了コードだけ決めて自然に終える。
// 環境の問題は、指摘より優先して 3 を返す。
const failed = results.filter((r) => r.state === 'ng').length;
if (results.some((r) => r.state === 'env')) {
	process.stderr.write('\nプロジェクト品質チェック: 環境の問題で実行できなかった検査があります。\n');
	process.exitCode = 3;
} else if (failed > 0) {
	process.stdout.write(`\nプロジェクト品質チェック: ${failed} 件の検査が失敗しました。\n`);
	process.exitCode = 1;
} else {
	process.stdout.write('プロジェクト品質チェック: 指摘はありません。\n');
}
