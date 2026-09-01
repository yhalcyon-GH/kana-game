from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: issue159PatchRolloutWorkflow.py <workflow-path>')

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')

marker = "curriculum_test = Path('src/data/curriculum.test.ts')"
if marker in text:
    print('rollout workflow already contains verified MP3 test fixes')
    raise SystemExit(0)

needle = """          test.write_text(text.replace('audio/characters/ka.wav', 'audio/characters/ka.mp3'), encoding='utf-8')

          gen = Path('scripts/generateAudioElevenLabs.ts')
"""
replacement = """          test.write_text(text.replace('audio/characters/ka.wav', 'audio/characters/ka.mp3'), encoding='utf-8')

          curriculum_test = Path('src/data/curriculum.test.ts')
          text = curriculum_test.read_text(encoding='utf-8')
          old_description = \"it('a WAV file exists on disk for each of the 12 audio ids', () => {\"
          old_path = \"`${audioId}.wav`\"
          if old_description not in text or old_path not in text:
              raise SystemExit('curriculum WAV audio assertion not found')
          text = text.replace(old_description, \"it('an MP3 file exists on disk for each of the 12 audio ids', () => {\")
          text = text.replace(old_path, \"`${audioId}.mp3`\", 1)
          curriculum_test.write_text(text, encoding='utf-8')

          quiz_test = Path('src/routes/games/KanaQuizPage.test.tsx')
          text = quiz_test.read_text(encoding='utf-8')
          old_comment = 'round-start autoplay — its .src encodes \"characters/<id>.wav\",'
          old_regex = r'promptAudio.src.match(/\\/audio\\/characters\\/([^/]+)\\.wav$/)'
          if old_comment not in text or old_regex not in text:
              raise SystemExit('KanaQuiz WAV URL assertion not found')
          text = text.replace(old_comment, 'round-start autoplay — its .src encodes \"characters/<id>.mp3\",')
          text = text.replace(old_regex, r'promptAudio.src.match(/\\/audio\\/characters\\/([^/]+)\\.mp3$/)')
          quiz_test.write_text(text, encoding='utf-8')

          gen = Path('scripts/generateAudioElevenLabs.ts')
"""

if text.count(needle) != 1:
    raise SystemExit(f'expected exactly one rollout patch anchor, found {text.count(needle)}')

patched = text.replace(needle, replacement, 1)
path.write_text(patched, encoding='utf-8')
print('patched rollout workflow with verified MP3 test fixes')
