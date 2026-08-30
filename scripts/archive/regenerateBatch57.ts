// One-off: regenerate the 57 kanji-audioText words that were flagged by
// Whisper/Azure, now that a trailing "。" has been added to each audioText
// to fix the word-final-mora clipping issue (see wa-nihon's ん investigation).
import path from 'node:path'
import { WORDS_BY_ROW } from '../../src/data/words'
import { OUT_DIR, requireApiKey, synthesizeToFile } from '../elevenLabsClient'

const VOICE_ID = 'fWZkPh6JTVXYK2vuJIbv'

const WORD_IDS = [
  'a-ai', 'a-ie', 'a-ao', 'ka-aka', 'ka-kiku', 'sa-sekai', 'sa-sushi', 'ta-te', 'ta-ito', 'ta-chizu',
  'ta-tsuki', 'ta-chikatetsu', 'na-neko', 'na-natsu', 'ha-hoshi', 'ha-fune', 'ha-haha', 'ha-hebi',
  'ma-kumo', 'ma-kudamono', 'ma-namae', 'ma-megane', 'ma-sashimi', 'ya-yama', 'ya-hayai', 'ra-sakura',
  'ra-tori', 'ra-karaage', 'wa-hon', 'wa-kanpai', 'wa-tonkatsu', 'sokuon-kakko', 'sokuon-mate',
  'sokuon-mote', 'sokuon-iki', 'sokuon-ikki', 'chouon-a-obasan', 'chouon-a-obaasan', 'chouon-a-okaasan',
  'chouon-i-ojiisan', 'chouon-i-oniisan', 'chouon-u-suuji', 'chouon-e-teinei', 'chouon-o-ookii',
  'chouon-o-tooi', 'chouon-o-koori', 'youon-ka-kyaku', 'youon-ka-kingyo', 'youon-ka-gyuuniku',
  'youon-cha-na-chawan', 'youon-cha-na-chuui', 'youon-cha-na-nyuuin', 'youon-ha-hyaku',
  'youon-ha-byouin', 'youon-ha-sanbyaku', 'youon-ma-ra-myouji', 'youon-ma-ra-ryokou',
]

async function main() {
  const apiKey = requireApiKey()
  const allWords = Object.values(WORDS_BY_ROW).flat()

  for (const id of WORD_IDS) {
    const word = allWords.find((w) => w.id === id)
    if (!word) {
      console.error(`Unknown word id "${id}"`)
      continue
    }
    const text = word.audioText ?? word.kana
    const outPath = path.join(OUT_DIR, 'words', `${word.id}.wav`)
    await synthesizeToFile(outPath, text, apiKey, VOICE_ID)
    console.log(`  wrote words/${word.id}.wav  ("${text}")`)
  }

  console.log('Done.')
}

main()
