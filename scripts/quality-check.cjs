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

// シェルを通さずに起動する。出力の上限で子プロセスを止めない（長い指摘を「起動できない」にしないため）。
function run(cmd, args) {
	const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: Infinity });
	return {
		ok: !r.error && r.status === 0,
		stdout: (r.stdout || '').trim(),
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
	{ name: 'backend (gradlew check)', args: dockerExec(BACKEND, './gradlew', 'check', '--console=plain') },
	{ name: 'frontend (lint)', args: dockerExec(FRONTEND, 'npm', 'run', 'lint') },
	{ name: 'frontend (typecheck)', args: dockerExec(FRONTEND, 'npm', 'run', 'typecheck') },
	{ name: 'frontend (test)', args: dockerExec(FRONTEND, 'npm', 'test') },
];

function tail(text) {
	return text.split('\n').slice(-TAIL_LINES).join('\n');
}

// 1つ落ちても残りを走らせ、最後にまとめて出す。
const results = [];
for (const check of checks) {
	const started = Date.now();
	const r = run('docker', check.args);
	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	results.push({ name: check.name, ok: r.ok, seconds });
	if (r.ok) continue;

	process.stdout.write(`\n[NG] ${check.name}\n${tail(r.out)}\n`);
	if (check.name.startsWith('backend')) {
		// SpotBugs の指摘は gradle の出力ではなくレポートに出る。
		const report = run('docker', dockerExec(BACKEND, 'sh', '-c', 'cat build/reports/spotbugs/*.txt 2>/dev/null')).stdout;
		if (report) process.stdout.write(`\n[SpotBugs レポート]\n${report}\n`);
	}
}

process.stdout.write('\n');
for (const r of results) {
	process.stdout.write(`[${r.ok ? 'OK' : 'NG'}] ${r.name} (${r.seconds}s)\n`);
}

// process.exit は書き残しを捨てる（Linux のパイプは非同期なので、長い出力の末尾が消える）。終了コードだけ決めて自然に終える。
const failed = results.filter((r) => !r.ok).length;
if (failed > 0) {
	process.stdout.write(`\nプロジェクト品質チェック: ${failed} 件の検査が失敗しました。\n`);
	process.exitCode = 1;
} else {
	process.stdout.write('プロジェクト品質チェック: 指摘はありません。\n');
}
