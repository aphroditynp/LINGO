const LEGACY_USER_ID = "BIMA001";


/**
 * Mengambil USER ID yang sedang aktif.
 *
 * Untuk pengguna biasa:
 * getCurrentUserId()
 *
 * Untuk administrator yang sedang melihat user tertentu:
 * getCurrentUserId("BIMA002")
 */
export function getCurrentUserId(userIdOverride = null) {

    return (
        userIdOverride
        ||
        localStorage.getItem("lingoUserId")
        ||
        LEGACY_USER_ID
    );

}


/**
 * Menyimpan USER ID untuk penggunaan biasa.
 */
export function setCurrentUserId(userId) {

    localStorage.setItem(
        "lingoUserId",
        userId
    );

}