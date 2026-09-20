import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  RETENTION_DAYS_DEFAULT,
  SETTING_KEYS,
  parseAutoCleanup,
  parseRetentionDays,
  toGeneralSettings,
  validateRetentionDays,
} from './settings.ts';

test('parseRetentionDays lê o valor gravado', () => {
  assert.equal(parseRetentionDays('7'), 7);
  assert.equal(parseRetentionDays(' 90 '), 90);
});

test('parseRetentionDays cai no default para valor inútil', () => {
  // Um NaN aqui viraria comparação contra Invalid Date na limpeza diária: ou não
  // apagaria nada, ou apagaria demais.
  for (const entrada of [null, undefined, '', '   ', 'abc', '0', '-5', '9999']) {
    assert.equal(parseRetentionDays(entrada as any), RETENTION_DAYS_DEFAULT, String(entrada));
  }
});

test('parseAutoCleanup trata as formas de desligado', () => {
  for (const off of ['false', 'FALSE', '0', 'no', 'off']) {
    assert.equal(parseAutoCleanup(off), false, off);
  }
  for (const on of ['true', '1', 'sim', 'qualquer']) {
    assert.equal(parseAutoCleanup(on), true, on);
  }
});

test('parseAutoCleanup sem valor fica ligado (comportamento atual)', () => {
  assert.equal(parseAutoCleanup(null), true);
  assert.equal(parseAutoCleanup(''), true);
});

test('validateRetentionDays aceita a faixa e recusa o resto', () => {
  assert.equal(validateRetentionDays(30), 30);
  assert.equal(validateRetentionDays('45'), 45);
  for (const ruim of [0, -1, 366, 1.5, 'abc', null, undefined]) {
    assert.throws(() => validateRetentionDays(ruim), /Retenção deve ser/, String(ruim));
  }
});

test('toGeneralSettings monta o objeto a partir das linhas chave/valor', () => {
  const settings = toGeneralSettings([
    { key: SETTING_KEYS.retentionDays, value: '14' },
    { key: SETTING_KEYS.autoCleanup, value: 'false' },
  ]);
  assert.deepEqual(settings, { retentionDays: 14, autoCleanup: false });
});

test('toGeneralSettings usa defaults quando a tabela está vazia', () => {
  // É o estado de toda instalação existente: a tabela Setting nunca foi lida.
  assert.deepEqual(toGeneralSettings([]), { retentionDays: 30, autoCleanup: true });
});
