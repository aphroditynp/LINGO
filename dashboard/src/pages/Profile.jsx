import {
    useEffect,
    useState
} from "react";

import { useNavigate } from "react-router-dom";

import API from "../api";
import {
    clearCurrentUserId,
    getCurrentUserId,
    isUsingDemoProfile
} from "../user";


function Profile() {

    const navigate =
        useNavigate();

    const [deleteConfirm, setDeleteConfirm] =
        useState("");

    const [deleting, setDeleting] =
        useState(false);

    const [deleteError, setDeleteError] =
        useState("");

    const [profile, setProfile] =
        useState(null);

    const [name, setName] =
        useState("");

    const [age, setAge] =
        useState("");

    const [loading, setLoading] =
        useState(true);

    const [saving, setSaving] =
        useState(false);

    const [message, setMessage] =
        useState("");

    const [shareUrl, setShareUrl] =
        useState("");

    const [sharing, setSharing] =
        useState(false);

    const [shareMessage, setShareMessage] =
        useState("");



    // Ambil profil
    useEffect(() => {

        API.get(
            `/users/${getCurrentUserId()}`
        )

            .then((response) => {

                setProfile(
                    response.data
                );

                setName(
                    response.data.name || ""
                );

                setAge(
                    response.data.age || ""
                );

            })

            .catch((error) => {

                console.log(error);

            })

            .finally(() => {

                setLoading(false);

            });

    }, []);



    // Simpan profil
    const handleSave = async (event) => {

        event.preventDefault();

        setSaving(true);

        setMessage("");


        try {

            const response =
                await API.put(
                    `/users/${getCurrentUserId()}`,
                    {
                        name: name,
                        age: age
                    }
                );


            setProfile(
                response.data
            );


            setMessage(
                "Profil berhasil diperbarui."
            );


        } catch (error) {

            console.log(error);

            setMessage(
                "Profil gagal diperbarui."
            );

        } finally {

            setSaving(false);

        }

    };



    // Link agar ayah/ibu/guru bisa membuka dashboard ini di perangkat lain.
    const handleCreateShareLink = async () => {

        setSharing(true);

        setShareMessage("");


        try {

            const response =
                await API.post(
                    "/access/share",
                    {
                        user_id: getCurrentUserId()
                    }
                );


            setShareUrl(
                response.data.url
            );

        } catch (error) {

            console.log(error);

            setShareMessage(
                error.response?.data?.error ||
                "Link gagal dibuat."
            );

        } finally {

            setSharing(false);

        }

    };



    const handleRevokeLinks = async () => {

        const confirmed =
            window.confirm(
                "Cabut semua link akses?\n\n" +
                "Link yang pernah dibagikan tidak bisa dibuka lagi. " +
                "HP/laptop yang sudah membuka dashboard tetap bisa " +
                "melihatnya, dan scan QR pada LINGO tetap berlaku."
            );


        if (!confirmed) {

            return;

        }


        setSharing(true);

        setShareMessage("");


        try {

            const response =
                await API.post(
                    "/access/revoke",
                    {
                        user_id: getCurrentUserId()
                    }
                );


            setShareUrl("");

            setShareMessage(
                `${response.data.revoked} link berhasil dicabut.`
            );

        } catch (error) {

            console.log(error);

            setShareMessage(
                error.response?.data?.error ||
                "Link gagal dicabut."
            );

        } finally {

            setSharing(false);

        }

    };



    const handleCopyShareLink = async () => {

        try {

            await navigator.clipboard.writeText(
                shareUrl
            );

            setShareMessage(
                "Link disalin."
            );

        } catch {

            setShareMessage(
                "Salin manual link di atas."
            );

        }

    };



    // Hapus profil permanen: profil, history, dan link akses.
    // LINGO yang terpasang kembali ke halaman aktivasi awal.
    const handleDeleteProfile = async (event) => {

        event.preventDefault();

        setDeleting(true);

        setDeleteError("");


        try {

            await API.delete(
                `/users/${getCurrentUserId()}`
            );

            clearCurrentUserId();

            navigate(
                "/register-device?deleted=1",
                { replace: true }
            );

        } catch (error) {

            console.log(error);

            setDeleteError(
                error.response?.data?.error ||
                "Profil gagal dihapus."
            );

            setDeleting(false);

        }

    };


    const deleteNameMatches =
        deleteConfirm.trim().toLowerCase() ===
        (profile?.name || "").trim().toLowerCase() &&
        deleteConfirm.trim() !== "";



    if (loading) {

        return (

            <div className="container">

                <div className="profile-loading">

                    Memuat profil...

                </div>

            </div>

        );

    }



    return (

        <div className="container profile-page">


            {isUsingDemoProfile() && (

                <div
                    className="demo-profile-banner"
                    role="status"
                >
                    Ini <strong>data contoh</strong>.
                    Scan QR pada LINGO atau buka link
                    akses dari keluarga untuk melihat
                    perkembangan anakmu.
                </div>

            )}


            {profile?.active === false && (

                <div
                    className="device-register-error profile-inactive"
                    role="alert"
                >
                    Profil ini sudah dinonaktifkan admin.
                    Scan QR pada LINGO untuk mendaftarkan
                    profil anak yang baru.
                </div>

            )}


            <div className="profile-header">

                <span>
                    PROFIL LINGO
                </span>

                <h1>
                    Profil Anak
                </h1>

                <p>
                    Kelola informasi anak yang
                    menggunakan LINGO.
                </p>

            </div>



            <div className="profile-layout">


                {/* PROFILE CARD */}

                <div className="profile-info-card">

                    <div className="profile-avatar">

                        {name
                            ? name
                                .charAt(0)
                                .toUpperCase()
                            : "?"
                        }

                    </div>


                    <h2>
                        {name || "Pengguna LINGO"}
                    </h2>


                    <p>
                        {age
                            ? `${age} tahun`
                            : "Umur belum diatur"
                        }
                    </p>


                    <div className="profile-id">

                        ID Anak

                        <strong>
                            {profile?.id ||
                                getCurrentUserId()
                            }
                        </strong>

                    </div>

                </div>



                {/* EDIT CARD */}

                <div className="profile-form-card">

                    <h2>
                        Informasi Anak
                    </h2>

                    <p className="form-description">
                        Informasi ini digunakan pada
                        dashboard dan laporan LINGO.
                    </p>


                    <form
                        onSubmit={
                            handleSave
                        }
                    >


                        <label>
                            Nama Anak
                        </label>

                        <input
                            type="text"
                            value={name}
                            onChange={
                                (event) =>
                                    setName(
                                        event.target.value
                                    )
                            }
                            placeholder="Masukkan nama anak"
                        />



                        <label>
                            Umur
                        </label>

                        <input
                            type="number"
                            min="1"
                            max="18"
                            value={age}
                            onChange={
                                (event) =>
                                    setAge(
                                        event.target.value
                                    )
                            }
                            placeholder="Masukkan umur"
                        />



                        <button
                            type="submit"
                            disabled={saving}
                        >

                            {saving
                                ? "Menyimpan..."
                                : "Simpan Perubahan"
                            }

                        </button>


                        {message && (

                            <p className="profile-message">

                                {message}

                            </p>

                        )}

                    </form>

                </div>


            </div>



            {/* Profil contoh (belum scan QR) tidak boleh dibagikan atau dihapus. */}
            {!isUsingDemoProfile() && (

            <>

            {/* SHARE CARD */}

            <div className="profile-form-card profile-share-card">

                <h2>
                    Bagikan Akses
                </h2>

                <p className="form-description">
                    Buka dashboard ini di HP atau laptop lain.
                    Kirim link ke ayah, ibu, atau guru, atau
                    scan ulang QR yang ada di LINGO. Siapa pun
                    yang memegang link ini bisa melihat dan
                    mengubah profil anak, jadi bagikan hanya
                    ke orang yang dipercaya.
                </p>


                {shareUrl ? (

                    <>

                        <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            onFocus={
                                (event) =>
                                    event.target.select()
                            }
                            aria-label="Link akses dashboard"
                        />


                        <div className="share-actions">

                            <button
                                type="button"
                                onClick={
                                    handleCopyShareLink
                                }
                            >
                                Salin Link
                            </button>


                            <a
                                className="share-whatsapp"
                                href={
                                    "https://wa.me/?text=" +
                                    encodeURIComponent(
                                        `Buka dashboard LINGO ${name || "anak"}: ${shareUrl}`
                                    )
                                }
                                target="_blank"
                                rel="noreferrer"
                            >
                                Kirim via WhatsApp
                            </a>

                        </div>

                    </>

                ) : (

                    <button
                        type="button"
                        onClick={
                            handleCreateShareLink
                        }
                        disabled={sharing}
                    >

                        {sharing
                            ? "Membuat link..."
                            : "Buat Link Akses"
                        }

                    </button>

                )}


                <button
                    type="button"
                    className="share-revoke-button"
                    onClick={
                        handleRevokeLinks
                    }
                    disabled={sharing}
                >
                    Cabut Semua Link Akses
                </button>


                {shareMessage && (

                    <p className="profile-message">

                        {shareMessage}

                    </p>

                )}

            </div>



            {/* DELETE CARD */}

            <div className="profile-form-card profile-danger-card">

                <h2>
                    Hapus Profil
                </h2>

                <p className="form-description">
                    Profil, seluruh history belajar,
                    dan link akses akan dihapus
                    permanen dan tidak bisa
                    dikembalikan. LINGO akan kembali
                    ke halaman aktivasi awal sehingga
                    QR-nya bisa dipakai untuk profil
                    anak yang baru.
                </p>


                <form
                    onSubmit={
                        handleDeleteProfile
                    }
                >

                    <label htmlFor="delete-confirm">
                        Ketik nama anak
                        {" "}
                        <strong>
                            {profile?.name || ""}
                        </strong>
                        {" "}
                        untuk konfirmasi
                    </label>

                    <input
                        id="delete-confirm"
                        type="text"
                        value={deleteConfirm}
                        onChange={
                            (event) =>
                                setDeleteConfirm(
                                    event.target.value
                                )
                        }
                        autoComplete="off"
                    />


                    {deleteError && (

                        <p
                            className="device-register-error"
                            role="alert"
                        >
                            {deleteError}
                        </p>

                    )}


                    <button
                        type="submit"
                        disabled={
                            !deleteNameMatches ||
                            deleting
                        }
                    >

                        {deleting
                            ? "Menghapus..."
                            : "Hapus Profil Permanen"
                        }

                    </button>

                </form>

            </div>

            </>

            )}


        </div>

    );

}


export default Profile;