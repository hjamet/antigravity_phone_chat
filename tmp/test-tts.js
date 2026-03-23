import * as googleTTS from 'google-tts-api';
try {
  const text = "Bonjour, ceci est un test de la synthèse vocale serveur.";
  const urls = googleTTS.getAllAudioUrls(text, { lang: 'fr', slow: false, host: 'https://translate.google.com', splitPunct: ',.?!' });
  console.log("Success! URLs:", urls);
} catch (e) {
  console.error("Failed", e);
}
