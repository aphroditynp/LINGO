#ifndef LINGO_SPEECH_INFERENCING_H
#define LINGO_SPEECH_INFERENCING_H

#include <stddef.h>
#include <stdint.h>

// ITU/AKU/BIMA/LULA memakai model gabungan 1141951.
// Model lain = satu project Edge Impulse per blok Tantangan Bicara.
enum LingoSpeechModel {
    LINGO_MODEL_ITU,
    LINGO_MODEL_AKU,
    LINGO_MODEL_BIMA,
    LINGO_MODEL_LULA,
    LINGO_MODEL_T1_BLOK2,  // 1149727: Baru, Beli, Bola, Buku
    LINGO_MODEL_T1_BLOK3,  // 1149728: Kamera, Lemari, Selama, Selasa
    LINGO_MODEL_T2_BLOK1,  // 1149729: Bu-mi, Kereta, Li-ma, Ma-du, Sa-te
    LINGO_MODEL_T2_BLOK2,  // 1149730: Bahasa, Bolaku, Kereta, Terima
    LINGO_MODEL_T2_BLOK3   // 1149732: Bekasi, Matahari, Matamu, Melati
};

bool lingoRecognize(
    LingoSpeechModel model,
    const int16_t *audio,
    size_t sampleCount,
    const char **detectedLabel,
    float *confidence
);

#endif
