export function fromB64(str) {
    const dec = new TextDecoder();
    try {
        return dec.decode(Uint8Array.fromBase64(str, {alphabet: "base64url"}));
    } catch {
        // Older versions of diagrama used base64 instead of base64url.
        return dec.decode(Uint8Array.fromBase64(str, {alphabet: "base64"}));
    }
}

export function toB64(str, alphabet="base64url") {
    const barr = new TextEncoder().encode(str);
    return barr.toBase64({alphabet});
}
