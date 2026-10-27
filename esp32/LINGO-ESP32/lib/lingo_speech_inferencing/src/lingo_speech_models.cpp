#include "lingo_speech_inferencing.h"
#include "edge-impulse-sdk/classifier/ei_run_classifier.h"
#include <Arduino.h>
#include "esp_heap_caps.h"
#include <stdlib.h>
#include <string.h>

static const int16_t *audioBuffer = nullptr;
static size_t audioBufferSamples = 0;

// Diagnostics: identify the first boundary at which heap metadata is damaged.
// Abort deliberately on corruption; freeing a corrupt allocation would obscure the source.
static void lingoHeapCheckpoint(const char *stage) {
#if defined(LINGO_EI_HEAP_DIAGNOSTICS) && LINGO_EI_HEAP_DIAGNOSTICS
    if (!heap_caps_check_integrity_all(false)) {
        Serial.printf("[HEAP-FAULT] stage=%s; detailed check follows\n", stage);
        Serial.flush();
        heap_caps_check_integrity_all(true);
        abort();
    }
    Serial.printf("[HEAP-OK] %s\n", stage);
#endif
}


void *ei_calloc(size_t nitems, size_t size) {
    if (size != 0 && nitems > SIZE_MAX / size) {
        return nullptr;
    }
    const size_t totalSize = nitems * size;

    // Large buffers (including 512KB EON arena) must use external PSRAM.
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
    // Prevent any DSP request from reading beyond the one-second audio buffer.
    if (audioBuffer == nullptr || outPtr == nullptr ||
        offset > audioBufferSamples || length > audioBufferSamples - offset) {
        Serial.printf("[EI] Invalid audio request offset=%u length=%u samples=%u\n",
                      (unsigned)offset, (unsigned)length, (unsigned)audioBufferSamples);
        return -1;
    }
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
    if (audio == nullptr || detectedLabel == nullptr || confidence == nullptr ||
        sampleCount != 16000) {
        Serial.println("[EI] Input audio / ukuran input tidak valid (butuh 16000 sampel).");
        return false;
    }
    *detectedLabel = nullptr;
    *confidence = 0.0f;
    audioBuffer = audio;
    audioBufferSamples = sampleCount;
    lingoHeapCheckpoint("lingoRecognize enter (before process_impulse)");

    signal_t signal;
    signal.total_length = sampleCount;
    signal.get_data = &getAudioData;

    ei_impulse_result_t result = {0};
    EI_IMPULSE_ERROR error;

    // Satu model gabungan (project 1141951): aku, bima, itu, lula, noise, unknown.
    // Enum hanya menandai kata target; label dicocokkan oleh pemanggil.
    switch (model) {
        case LINGO_MODEL_ITU:
        case LINGO_MODEL_AKU:
        case LINGO_MODEL_BIMA:
        case LINGO_MODEL_LULA:
            error = process_impulse(&impulse_handle_1141951_1, &signal, &result, false);
            break;
        default:
            return false;
    }

    lingoHeapCheckpoint("lingoRecognize returned from process_impulse");

    if (error != EI_IMPULSE_OK) {
        Serial.printf("[EI] Inferensi gagal, kode=%d\n", (int)error);
        Serial.printf("[EI] Sisa PSRAM=%u, sisa heap internal=%u bytes\n",
                      (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM),
                      (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
        return false;
    }

    size_t bestIndex = 0;
    for (size_t i = 1; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
        if (result.classification[i].value > result.classification[bestIndex].value) {
            bestIndex = i;
        }
    }

    *detectedLabel = result.classification[bestIndex].label;
    *confidence = result.classification[bestIndex].value;
    return true;
}
