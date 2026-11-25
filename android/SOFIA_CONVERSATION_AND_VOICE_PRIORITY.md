# Sofia AI: priority conversation and voice requirements

Status: approved product requirements; implementation must pass automated checks and on-device listening tests before release.

## P0: Natural Russian conversation

1. Target conversational quality close to a strong ChatGPT voice conversation: understand intent and nuance, maintain context, respond coherently, and handle topic changes naturally.
2. Use correct Russian grammar throughout the entire response: cases, declensions, gender/number agreement, tense, word order, and punctuation. Do not rely only on a small list of corrected first-person verbs.
3. Sofia speaks about herself in feminine grammatical forms consistently, including confirmations, explanations, and error messages.
4. Avoid robotic templates, repeated openings, paraphrasing the user's question, unnecessary lists, and bureaucratic phrasing.
5. Adapt tone and sentence length to context without exaggerated or fabricated emotion. Ask one focused clarifying question when information is genuinely missing.
6. Preserve relevant dialogue history and do not ask the owner to repeat information already available.

## P0: Clearly feminine, natural voice

1. The chosen Russian TTS voice must sound recognizably feminine to the owner, with a calm, warm, adult, natural timbre.
2. Do not infer perceived gender from Android voice quality, latency, or voice identifiers. Those metadata fields do not establish how a voice sounds.
3. Do not silently select an arbitrary "highest quality" Russian voice on first launch. Use an explicitly auditioned and saved voice; if none is selected or the saved voice disappears, tell the owner to open voice settings and audition alternatives.
4. Provide a spoken preview long enough to assess timbre, pronunciation, feminine verb forms, sentence flow, and intonation. The owner makes the final selection by listening.
5. Pitch and speech-rate controls are secondary fine-tuning only. Do not try to turn a masculine-sounding voice into a feminine one by pitch adjustment alone.
6. Persist the chosen voice and settings across service restarts. Apply saved settings consistently to both preview and background voice service.
7. Evaluate available voices on the actual Samsung device. Do not claim that a voice is suitable until the owner has heard it.

## P0: Speech output quality

1. Formulate complete, natural Russian text before sending it to TTS.
2. Preserve sentence boundaries and punctuation in streamed chunks so that streaming does not produce clipped words, unnatural pauses, or broken intonation.
3. Keep streaming responsive, but do not sacrifice grammar or sentence integrity for earlier audio.
4. Verify long answers, follow-up dialogue, interruptions, empty responses, TTS initialization failures, and service restarts.

## Existing language and product constraints

- The conversation with the owner is in Russian.
- Incoming Korean messages may be translated into Russian for understanding. Do not generate spoken Korean translations or Korean voice replies.
- The owner wants location answers as city and district, not latitude/longitude values.
- No release or installation is approved until automated checks pass and the owner completes real-device listening and conversation tests.

## Acceptance test

On the owner's phone, run a several-minute conversation with ordinary questions, follow-ups, an interruption, and a topic change. Confirm natural Russian grammar, feminine self-reference, coherent context retention, non-repetitive replies, and a clearly feminine voice that remains natural in both short and long responses. The owner must approve the sound by listening.
