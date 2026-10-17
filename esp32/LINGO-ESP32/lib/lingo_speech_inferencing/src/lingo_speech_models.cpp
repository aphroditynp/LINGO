#include "lingo_speech_inferencing.h"
#include "edge-impulse-sdk/classifier/ei_run_classifier.h"
#include "model-parameters/model_variables_lula.h"
#include "model-parameters/model_variables_bima.h"
#include "model-parameters/model_variables_aku.h"
#include <Arduino.h>
#include "esp_heap_caps.h"
#include <stdlib.h>
#include <string.h>

static const int16_t *audioBuffer = nullptr;

void *ei_calloc(size_t nitems, size_t size) {
    const size_t totalSize = nitems * size;

    if (totalSize >= 65536 && psramFound()) {
        return heap_caps_calloc(
            nitems,
            size,
            MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT
        );
    }

    return calloc(nitems, size);
}

void *ei_malloc(size_t size) {
    if (size >= 65536 && psramFound()) {
        return heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    }

    return malloc(size);
}

void ei_free(void *ptr) {
    free(ptr);
}

static int getAudioData(size_t offset, size_t length, float *outPtr) {
    numpy::int16_to_float(&audioBuffer[offset], outPtr, length);
    return 0;
}

bool lingoRecognize(
    LingoSpeechModel model,
    const int16_t *audio,
    size_t sampleCount,
    const char **detectedLabel,
    float *confidence
) {
    audioBuffer = audio;

    signal_t signal;
    signal.total_length = sampleCount;
    signal.get_data = &getAudioData;

    ei_impulse_result_t result = {0};
    EI_IMPULSE_ERROR error;

    switch (model) {
        case LINGO_MODEL_ITU:
            error = process_impulse(&impulse_handle_1141462_1, &signal, &result, false);
            break;
        case LINGO_MODEL_AKU:
            error = process_impulse(&impulse_handle_1141465_1, &signal, &result, false);
            break;
        case LINGO_MODEL_BIMA:
            error = process_impulse(&impulse_handle_1141466_1, &signal, &result, false);
            break;
        case LINGO_MODEL_LULA:
            error = process_impulse(&impulse_handle_1141467_1, &signal, &result, false);
            break;
        default:
            return false;
    }

    if (error != EI_IMPULSE_OK) {
        return false;
    }

    size_t bestIndex = 0;
    for (size_t i = 1; i < 3; i++) {
        if (result.classification[i].value > result.classification[bestIndex].value) {
            bestIndex = i;
        }
    }

    *detectedLabel = result.classification[bestIndex].label;
    *confidence = result.classification[bestIndex].value;
    return true;
}
