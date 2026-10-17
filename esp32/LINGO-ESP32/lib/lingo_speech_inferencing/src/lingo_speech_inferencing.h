#ifndef LINGO_SPEECH_INFERENCING_H
#define LINGO_SPEECH_INFERENCING_H

#include <stddef.h>
#include <stdint.h>

enum LingoSpeechModel { LINGO_MODEL_ITU, LINGO_MODEL_AKU, LINGO_MODEL_BIMA, LINGO_MODEL_LULA };

bool lingoRecognize(
    LingoSpeechModel model,
    const int16_t *audio,
    size_t sampleCount,
    const char **detectedLabel,
    float *confidence
);

#endif
