const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

function buildRegistrationUrl(websiteUrl, code) {
    const origin = new URL(websiteUrl);
    const registrationUrl = new URL("/register-device", origin);
    registrationUrl.searchParams.set("code", code);
    return registrationUrl.toString();
}

function buildActivation(code, deviceId) {
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    return {
        codeHash,
        activation: {
            device_id: deviceId,
            status: "available",
        },
    };
}

function printUsage() {
    console.log(
        "Usage: node scripts/create-device-qr.js <DEVICE_ID> <WEBSITE_URL> [--example]"
    );
    console.log(
        "Example QR only (does not activate a device): node scripts/create-device-qr.js LINGO-DEMO-001 https://your-site.example --example"
    );
    console.log(
        "Real QR: node scripts/create-device-qr.js LINGO002 https://your-live-site.example"
    );
}

async function main() {
    const args = process.argv.slice(2);
    const exampleMode = args.includes("--example");
    const positionalArgs = args.filter((arg) => !arg.startsWith("--"));
    const deviceId = positionalArgs[0];
    const websiteUrl = positionalArgs[1];

    if (
        !deviceId ||
        !/^[A-Za-z0-9_-]{3,64}$/.test(deviceId) ||
        !websiteUrl
    ) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    let origin;

    try {
        origin = new URL(websiteUrl);
    } catch {
        console.error("WEBSITE_URL harus berupa URL yang valid.");
        process.exitCode = 1;
        return;
    }

    if (!exampleMode && origin.protocol !== "https:") {
        console.error("Gunakan URL HTTPS untuk membuat QR perangkat produksi.");
        process.exitCode = 1;
        return;
    }

    const code = crypto.randomBytes(32).toString("hex");
    const { codeHash, activation } = buildActivation(code, deviceId);
    const registrationUrl = buildRegistrationUrl(websiteUrl, code);

    const outputDirectory = exampleMode
        ? path.resolve(__dirname, "../examples")
        : path.resolve(__dirname, "../private");

    fs.mkdirSync(outputDirectory, { recursive: true });

    if (!exampleMode) {
        fs.chmodSync(outputDirectory, 0o700);
    }

    const filePrefix = `${deviceId}-activation`;
    const qrPath = path.join(outputDirectory, `${filePrefix}.png`);
    let db;

    if (!exampleMode) {
        db = require("../firebase");
        const activationRef = db
            .collection("deviceActivations")
            .doc(codeHash);
        const deviceRef = db.collection("devices").doc(deviceId);

        await db.runTransaction(async (transaction) => {
            const [existingActivation, existingDevice] = await Promise.all([
                transaction.get(activationRef),
                transaction.get(deviceRef),
            ]);

            if (existingActivation.exists) {
                throw new Error("Kode aktivasi duplikat. Jalankan ulang script.");
            }

            if (existingDevice.exists) {
                throw new Error(
                    `Perangkat ${deviceId} sudah dipasangkan dan tidak dapat dipasangkan ulang.`
                );
            }

            transaction.create(activationRef, {
                ...activation,
                created_at: new Date().toISOString(),
            });
        });
    }

    try {
        await QRCode.toFile(qrPath, registrationUrl.toString(), {
            type: "png",
            errorCorrectionLevel: "H",
            margin: 4,
            width: 640,
            color: {
                dark: "#17233c",
                light: "#ffffff",
            },
        });

        if (!exampleMode) {
            fs.chmodSync(qrPath, 0o600);
        }

        const instructionsPath = path.join(
            outputDirectory,
            `${filePrefix}.txt`
        );

        fs.writeFileSync(
            instructionsPath,
            [
                `Device ID: ${deviceId}`,
                `Registration URL: ${registrationUrl.toString()}`,
                `QR PNG: ${qrPath}`,
                exampleMode
                    ? "EXAMPLE ONLY: this code is not activated in Firestore."
                    : "Keep this QR private until it is attached to this device.",
                "",
            ].join("\n"),
            { mode: 0o600 }
        );

        if (!exampleMode) {
            fs.chmodSync(instructionsPath, 0o600);
        }

        console.log(exampleMode ? "QR contoh dibuat." : "QR perangkat aktif dibuat dan diaktifkan di Firestore.");
        console.log(`Perangkat: ${deviceId}`);
        console.log(`URL pendaftaran: ${registrationUrl.toString()}`);
        console.log(`File QR: ${qrPath}`);
        console.log(`Petunjuk: ${instructionsPath}`);

        if (!exampleMode) {
            console.log("QR ini hanya dapat digunakan satu kali untuk mendaftarkan perangkat.");
        }
    } catch (error) {
        if (!exampleMode) {
            await db
                .collection("deviceActivations")
                .doc(codeHash)
                .delete()
                .catch(() => {});
        }

        throw error;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error("Gagal membuat QR:", error.message);
        process.exitCode = 1;
    });
}

module.exports = { buildActivation, buildRegistrationUrl };