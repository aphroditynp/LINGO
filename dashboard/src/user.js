const LEGACY_USER_ID = "BIMA001";

export function getCurrentUserId() {
    return localStorage.getItem("lingoUserId") || LEGACY_USER_ID;
}

export function setCurrentUserId(userId) {
    localStorage.setItem("lingoUserId", userId);
}