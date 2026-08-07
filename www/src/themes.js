// themes.js — 随等级推进切换的视觉主题（配色始终保持粉红/暗红/砖红家族）
(function (global) {
  'use strict';
  const T = global.BFTex;

  // 方块基础配色：高饱和度鲜艳色，确保在任何背景上都清晰可见
  const BASE_COLORS = {
    I: '#00E5FF',     // 亮青蓝
    O: '#FFD600',     // 金黄
    T: '#FF1493',     // 深粉红
    S: '#00FF00',     // 鲜绿
    Z: '#FF4500',     // 橙红
    J: '#1E90FF',     // 道奇蓝
    L: '#FF69B4',     // 热粉红
  };

  function tintColors(tint, amount) {
    const out = {};
    Object.keys(BASE_COLORS).forEach((k) => {
      out[k] = T.mix(BASE_COLORS[k], tint, amount);
    });
    return out;
  }

  const THEMES = [
    {
      id: 0, name: '深夜霓虹', minLevel: 1,
      bgDeep: '#0a0a15', wallBase: '#1a1a2e', frame: '#16213e', pit: '#0f0f1e',
      ambient: '#6a5aff', glow: '#00ff88', mote: '#ff00ff', ember: '#ffaa00',
      accent: '#00ff88', accentSoft: '#ff00ff',
      colors: tintColors('#00ffff', 0.0),
    },
    {
      id: 1, name: '赛博朋克', minLevel: 5,
      bgDeep: '#0d0221', wallBase: '#3a0ca3', frame: '#560bad', pit: '#10002b',
      ambient: '#e0aaff', glow: '#00f5ff', mote: '#ff006e', ember: '#fb5607',
      accent: '#00f5ff', accentSoft: '#ffbe0b',
      colors: tintColors('#00ffff', 0.0),
    },
    {
      id: 2, name: '电光幻影', minLevel: 9,
      bgDeep: '#0a0908', wallBase: '#2b2d42', frame: '#386641', pit: '#09090c',
      ambient: '#ff006e', glow: '#00ff41', mote: '#ffbe0b', ember: '#fb5607',
      accent: '#00ff41', accentSoft: '#ffbe0b',
      colors: tintColors('#00ffff', 0.0),
    },
    {
      id: 3, name: '极光之境', minLevel: 13,
      bgDeep: '#0b0014', wallBase: '#3d2645', frame: '#5a189a', pit: '#0f0013',
      ambient: '#00f5ff', glow: '#ff006e', mote: '#00ff88', ember: '#ffd60a',
      accent: '#00f5ff', accentSoft: '#ff006e',
      colors: tintColors('#00ffff', 0.0),
    },
    {
      id: 4, name: '炫彩天堂', minLevel: 17,
      bgDeep: '#1a0033', wallBase: '#440066', frame: '#ff0088', pit: '#220044',
      ambient: '#00ffff', glow: '#ffff00', mote: '#ff00ff', ember: '#00ff00',
      accent: '#ffff00', accentSoft: '#ff00ff',
      colors: tintColors('#00ffff', 0.0),
    },
  ];

  function themeForLevel(level) {
    let t = THEMES[0];
    for (const th of THEMES) if (level >= th.minLevel) t = th;
    return t;
  }

  global.BFThemes = { THEMES, themeForLevel, BASE_COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
