# Tamamizu Guide scripts

Short, locale-ready guide copy and visual direction. Guide UI logic must keep this content separate from components and learning progress state.

## Introduction: Hiragana and Katakana usage

This is Introduction step 4, after the sound comparison and before the Kanji meaning step. It replaces the previously planned standalone Katakana Guide; there is no standalone Hiragana Guide.

**Subtitle and narration (exact match)**

> Hiragana is mainly used for Japanese words and grammar. Katakana is mainly used for foreign words.

**Visual direction**

- Hiragana: `さくら` and `たべる`
- Katakana: `ケーキ` and `ゲーム`
- Include a small Tamamizu without covering the examples.
- Use the same portrait ratio, palette, illustration style, and margins as the other Introduction slides.
- Do not put the English narration sentence inside the image; the app renders it as the subtitle.

## Yōon Guide

**Narration**

> A small ya, yu, or yo joins the kana before it to make one sound. For example, ki plus small ya makes kya.

**Visual direction**

- Show `き + ゃ → きゃ`.
- Make the size difference between `や` and `ゃ` visually clear.
- Group `きゃ` as one spoken unit.
- Prefer static character placement and audio; do not add a long grammar explanation.

## Sokuon Guide

**Narration**

> A small tsu means a short pause before the next sound. Listen: きて, きって.

**Visual direction**

- Contrast `きて` and `きって`.
- Emphasize that `っ` is small.
- Pair the text with audio and a visible short-pause marker.
- Do not explain phonetic terminology or the internal curriculum system.

## Chōon Guide

**Narration**

> A long vowel holds the vowel sound for one extra beat. Katakana uses ー. Hiragana adds another vowel kana, depending on the sound.

**Visual direction**

- Contrast `おばさん` and `おばあさん`.
- Contrast `ビル` and `ビール`, emphasizing `ー`.
- Use audio to compare the short and long vowels.
- Do not teach every Hiragana long-vowel spelling rule in this Guide; the existing curriculum rows explain their individual patterns when reached.

Only these scripts and directions are finalized here. Future Guide state, trigger logic, images, audio filenames, and components remain unimplemented until each Guide is scoped.
