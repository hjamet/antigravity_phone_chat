import * as googleTTS from 'google-tts-api';

async function test() {
    try {
        const results = await googleTTS.getAllAudioBase64("Bonjour", {
            lang: 'fr',
            slow: false,
            host: 'https://translate.google.com',
            splitPunct: ',.?!'
        });
        console.log("Got base64:", results[0].base64.substring(0, 50) + "...");
    } catch (e) {
        console.error("error:", e);
    }
}
test();
