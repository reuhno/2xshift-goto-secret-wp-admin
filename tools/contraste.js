#!/usr/bin/env node
// 2xShift Goto secret wp-admin — mesure de contraste WCAG 2.x des variables de ui.css
//
// Jetable-mais-versionné, aucune dépendance npm : `node tools/contraste.js`.
// Lit ui.css, extrait les variables des trois blocs de couleur (:root clair,
// le bloc sombre @media (prefers-color-scheme: dark), et :root[data-theme="dark"]),
// vérifie que les deux blocs sombres sont identiques, puis calcule le ratio de
// contraste WCAG (luminance relative sRGB) pour les paires de couleurs du
// popup/réglages, dans les deux modes, et affiche un tableau PASS/FAIL.
//
// Cibles : 4,5:1 pour le texte (y compris les liens, traités comme texte
// normal), 3:1 pour les bordures de contrôles / l'anneau de focus / les
// icônes — cf. CLAUDE.md « Contraste (WCAG) ».

'use strict';

const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, '..', 'ui.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');

// --- Extraction des blocs de variables -------------------------------------

function extractBlock(source, selectorRegex) {
	const match = source.match(selectorRegex);
	if (!match) {
		return null;
	}
	return match[1];
}

function parseVars(blockContent) {
	if (blockContent === null) {
		return null;
	}
	const vars = {};
	const re = /--([\w-]+)\s*:\s*([^;]+);/g;
	let m;
	while ((m = re.exec(blockContent)) !== null) {
		vars[m[1]] = m[2].trim();
	}
	return vars;
}

// `:root {` exact (le `[data-theme="dark"]` empêche `:root\s*\{` de matcher
// l'autre bloc, puisqu'il faut une accolade immédiatement après `:root`).
const lightBlock = extractBlock(css, /:root\s*\{([^}]*)\}/);

const darkMediaOuter = extractBlock(
	css,
	/@media \(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/
);
const darkMediaBlock = darkMediaOuter
	? extractBlock(darkMediaOuter, /:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/)
	: null;

const darkAttrBlock = extractBlock(css, /:root\[data-theme="dark"\]\s*\{([^}]*)\}/);

const lightVars = parseVars(lightBlock);
const darkMediaVars = parseVars(darkMediaBlock);
const darkAttrVars = parseVars(darkAttrBlock);

if (!lightVars) {
	console.error('Impossible de trouver le bloc :root (clair) dans ui.css.');
	process.exit(1);
}
if (!darkMediaVars) {
	console.error('Impossible de trouver le bloc sombre @media (prefers-color-scheme: dark).');
	process.exit(1);
}
if (!darkAttrVars) {
	console.error('Impossible de trouver le bloc :root[data-theme="dark"].');
	process.exit(1);
}

// Cohérence entre les deux blocs sombres (mêmes clés, mêmes valeurs).
const darkKeys = new Set([...Object.keys(darkMediaVars), ...Object.keys(darkAttrVars)]);
const incoherences = [];
darkKeys.forEach((key) => {
	if (darkMediaVars[key] !== darkAttrVars[key]) {
		incoherences.push(
			`  --${key}: media=${darkMediaVars[key] || '(absent)'} vs attr=${darkAttrVars[key] || '(absent)'}`
		);
	}
});
if (incoherences.length > 0) {
	console.error('INCOHÉRENCE entre les deux blocs sombres de ui.css :');
	incoherences.forEach((line) => console.error(line));
	console.error('');
} else {
	console.log('OK : les deux blocs sombres (@media et [data-theme="dark"]) sont identiques.\n');
}

// Variables effectives par mode : le clair est la base, le sombre hérite du
// clair pour toute variable non redéfinie (cascade CSS des custom properties).
const modes = {
	clair: { ...lightVars },
	sombre: { ...lightVars, ...darkMediaVars },
};

// --- Contraste WCAG 2.x ------------------------------------------------------

function hexToRgb(hex) {
	const clean = hex.replace('#', '').trim();
	const full =
		clean.length === 3
			? clean
					.split('')
					.map((c) => c + c)
					.join('')
			: clean;
	const int = parseInt(full, 16);
	return {
		r: (int >> 16) & 255,
		g: (int >> 8) & 255,
		b: int & 255,
	};
}

function channelLuminance(c) {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
	const { r, g, b } = hexToRgb(hex);
	return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
	const lA = relativeLuminance(hexA);
	const lB = relativeLuminance(hexB);
	const lighter = Math.max(lA, lB);
	const darker = Math.min(lA, lB);
	return (lighter + 0.05) / (darker + 0.05);
}

// --- Paires à mesurer --------------------------------------------------------
//
// target 4.5 = texte (y compris liens, traités comme texte normal) ;
// target 3.0 = bordures de contrôles / anneau de focus / icônes.

const WHITE = '#ffffff';

const PAIRS = [
	{ n: 1, label: 'Texte courant / fond de page', fg: '--text', bg: '--bg', target: 4.5 },
	{ n: 2, label: 'Texte courant / carte', fg: '--text', bg: '--card-bg', target: 4.5 },
	{ n: 3, label: 'Texte atténué / carte', fg: '--muted', bg: '--card-bg', target: 4.5 },
	{ n: 4, label: 'Lien accent / carte', fg: '--accent', bg: '--card-bg', target: 4.5 },
	{ n: 5, label: 'Lien danger / carte', fg: '--danger', bg: '--card-bg', target: 4.5 },
	{ n: 6, label: 'Texte bouton principal (blanc) / fond bouton', fg: WHITE, bg: '--accent-button', target: 3.0 },
	{ n: 7, label: 'Texte + bordure bouton secondaire / carte', fg: '--accent', bg: '--card-bg', target: 3.0 },
	{ n: 8, label: 'Texte de statut (atténué) / carte', fg: '--muted', bg: '--card-bg', target: 4.5 },
	{ n: 9, label: 'Texte des champs / fond de champ', fg: '--text', bg: '--card-bg', target: 4.5 },
	{ n: 10, label: 'Bordure de champ / fond de carte', fg: '--border-field', bg: '--card-bg', target: 3.0 },
	{ n: 11, label: 'Contour de focus / fond (carte)', fg: '--accent', bg: '--card-bg', target: 3.0 },
];

function resolve(vars, token) {
	if (token.startsWith('--')) {
		const value = vars[token.slice(2)];
		if (!value) {
			throw new Error(`Variable ${token} introuvable dans ce mode.`);
		}
		return value;
	}
	return token;
}

// --- Affichage ---------------------------------------------------------------

const rows = [];
let anyFail = false;

['clair', 'sombre'].forEach((modeName) => {
	const vars = modes[modeName];
	PAIRS.forEach((pair) => {
		const fgValue = resolve(vars, pair.fg);
		const bgValue = resolve(vars, pair.bg);
		const ratio = contrastRatio(fgValue, bgValue);
		const pass = ratio >= pair.target;
		if (!pass) {
			anyFail = true;
		}
		rows.push({
			mode: modeName,
			n: pair.n,
			label: pair.label,
			fgValue,
			bgValue,
			ratio,
			target: pair.target,
			pass,
		});
	});
});

function pad(str, len) {
	str = String(str);
	return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

const headers = ['Mode', '#', 'Paire', 'Texte/bordure', 'Fond', 'Ratio', 'Cible', 'Résultat'];
const widths = [7, 3, 44, 10, 10, 7, 6, 8];

console.log(headers.map((h, i) => pad(h, widths[i])).join(' | '));
console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));

rows.forEach((row) => {
	const line = [
		row.mode,
		row.n,
		row.label,
		row.fgValue,
		row.bgValue,
		row.ratio.toFixed(2),
		row.target.toFixed(1),
		row.pass ? 'PASS' : 'FAIL',
	];
	console.log(line.map((v, i) => pad(v, widths[i])).join(' | '));
});

console.log('');
if (anyFail) {
	console.log('Au moins une paire est sous sa cible.');
	process.exitCode = 1;
} else {
	console.log('Toutes les paires passent leur cible, dans les deux modes.');
}
