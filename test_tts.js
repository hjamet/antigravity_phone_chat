import * as googleTTS from 'google-tts-api';

try {
    const urls = googleTTS.getAllAudioUrls("Bonjour, le système TTS fonctionne-t-il?", {
        lang: 'fr',
        slow: false,
        host: 'https://translate.google.com',
        splitPunct: ',.?!'
    });
    console.log(urls);
} catch (e) {
    console.error("error:", e);
}
