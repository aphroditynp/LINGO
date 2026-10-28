import TeacherManager from "../components/TeacherManager";
import {
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import API from "../api";


// "Terakhir kirim data" dibuat relatif agar mudah dibaca admin.
function formatLastSeen(isoTime) {

    if (!isoTime) {

        return "Belum pernah";

    }


    const minutes =
        Math.floor(
            (Date.now() - new Date(isoTime).getTime()) / 60000
        );


    if (minutes < 1) return "Baru saja";

    if (minutes < 60) return `${minutes} menit lalu`;

    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} jam lalu`;

    if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / 1440)} hari lalu`;


    return new Date(isoTime).toLocaleDateString(
        "id-ID",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function AdminDashboard() {

    const navigate =
        useNavigate();


    const [devices, setDevices] =
        useState([]);


    const [users, setUsers] =
        useState([]);


    const [loading, setLoading] =
        useState(true);


    const [error, setError] =
        useState("");


    const [resetting, setResetting] =
        useState("");


    const [newQR, setNewQR] =
        useState(null);


    // Tab aktif: "pengguna" (profil anak + LINGO) atau "guru".
    const [activeTab, setActiveTab] =
        useState(() => {
            try {
                return localStorage.getItem("lingoAdminTab") || "pengguna";
            } catch {
                return "pengguna";
            }
        });


    const selectTab = (tab) => {

        setActiveTab(tab);

        try {
            localStorage.setItem("lingoAdminTab", tab);
        } catch {
            // Tab tetap berpindah walau browser menolak penyimpanan.
        }

    };


    // Status tombol "Salin Link Akses" per user: "loading" | "copied" | "error".
    const [linkStatus, setLinkStatus] =
        useState({});


    const token =
        localStorage.getItem(
            "lingoAdminToken"
        );


    const adminConfig = {

        headers: {

            Authorization:
                `Bearer ${token}`

        }

    };


    // =====================================================
    // LOAD DATA ADMIN
    // =====================================================

    const loadData =
        async () => {

            try {

                setLoading(true);

                setError("");


                const [
                    devicesResponse,
                    usersResponse
                ] = await Promise.all([

                    API.get(
                        "/admin/devices",
                        adminConfig
                    ),

                    API.get(
                        "/admin/users",
                        adminConfig
                    )

                ]);


                setDevices(
                    Array.isArray(
                        devicesResponse.data
                    )
                        ? devicesResponse.data
                        : []
                );


                setUsers(
                    Array.isArray(
                        usersResponse.data
                    )
                        ? usersResponse.data
                        : []
                );


            } catch (requestError) {

                console.error(
                    "ADMIN LOAD ERROR:",
                    requestError
                );


                if (
                    requestError
                        .response
                        ?.status === 401
                ) {

                    localStorage.removeItem(
                        "lingoAdminToken"
                    );


                    navigate(
                        "/admin/login"
                    );


                    return;

                }


                setError(

                    requestError
                        .response
                        ?.data
                        ?.error ||

                    "Gagal mengambil data administrator."

                );


            } finally {

                setLoading(false);

            }

        };


    // =====================================================
    // LOAD AWAL
    // =====================================================

    useEffect(() => {

        if (!token) {

            navigate(
                "/admin/login"
            );

            return;

        }


        loadData();

    }, []);


    // =====================================================
    // RESET LINGO
    // =====================================================

    const handleReset =
        async (deviceId) => {

            const confirmed =
                window.confirm(

                    `Reset ${deviceId}?\n\n` +

                    `LINGO dilepas dari profil anak dan QR yang sama ` +
                    `kembali ke halaman aktivasi awal.\n` +

                    `Profil lama dinonaktifkan, history belajarnya tetap tersimpan.`

                );


            if (!confirmed) {

                return;

            }


            try {

                setResetting(
                    deviceId
                );


                setNewQR(
                    null
                );


                const response =
                    await API.post(

                        `/admin/devices/${deviceId}/reset`,

                        {},

                        adminConfig

                    );


                setNewQR(
                    response.data
                );


                await loadData();


            } catch (requestError) {

                console.error(
                    "RESET ERROR:",
                    requestError
                );


                alert(

                    requestError
                        .response
                        ?.data
                        ?.error ||

                    "Reset LINGO gagal."

                );


            } finally {

                setResetting(
                    ""
                );

            }

        };


    // =====================================================
    // HAPUS LINGO
    // =====================================================

    const handleDeleteDevice =
        async (deviceId) => {

            const confirmed =
                window.confirm(

                    `HAPUS ${deviceId}?\n\n` +

                    `LINGO dan QR-nya dihapus dari sistem. QR lama ` +
                    `tidak bisa dipakai lagi.\n` +

                    `Profil yang terpasang dinonaktifkan, history-nya tetap tersimpan.`

                );


            if (!confirmed) {

                return;

            }


            try {

                setResetting(
                    `hapus:${deviceId}`
                );


                setNewQR(
                    null
                );


                await API.delete(
                    `/admin/devices/${deviceId}`,
                    adminConfig
                );


                await loadData();

            } catch (requestError) {

                console.error(
                    "DELETE DEVICE ERROR:",
                    requestError
                );


                alert(
                    requestError
                        .response
                        ?.data
                        ?.error ||
                    "Hapus LINGO gagal."
                );

            } finally {

                setResetting(
                    ""
                );

            }

        };



    // =====================================================
    // NONAKTIFKAN / AKTIFKAN PROFIL
    // =====================================================

    const handleToggleUser =
        async (user) => {

            const deactivate =
                user.active !== false;


            const confirmed =
                window.confirm(

                    deactivate

                        ?

                        `Nonaktifkan profil ${user.name || user.id}?\n\n` +
                        `Orang tua tidak bisa membuka dashboard lewat QR atau link. ` +
                        `LINGO yang terpasang kembali ke aktivasi awal. ` +
                        `History belajar tetap tersimpan, dan saat diaktifkan lagi ` +
                        `profil otomatis terpasang di LINGO yang sama (jika belum dipakai anak lain).`

                        :

                        `Aktifkan lagi profil ${user.name || user.id}?\n\n` +
                        `Profil akan dipasang lagi di LINGO sebelumnya jika LINGO itu belum dipakai anak lain.`

                );


            if (!confirmed) {

                return;

            }


            try {

                setResetting(
                    `profil:${user.id}`
                );


                const response = await API.post(
                    `/admin/users/${user.id}/${deactivate ? "deactivate" : "activate"}`,
                    {},
                    adminConfig
                );


                await loadData();


                if (!deactivate) {

                    const restored = response.data.restored_devices || [];
                    const skipped = response.data.skipped_devices || [];

                    alert(
                        [
                            `Profil ${user.name || user.id} aktif lagi.`,
                            restored.length
                                ? `Terpasang lagi di ${restored.join(", ")}. Orang tua bisa scan QR LINGO yang sama.`
                                : "",
                            ...skipped.map(
                                (item) => `${item.device_id} tidak dipasang: ${item.reason}`
                            ),
                            !restored.length && !skipped.length
                                ? "Belum ada LINGO sebelumnya. Bagikan link akses atau pasangkan ke LINGO baru."
                                : "",
                        ].filter(Boolean).join("\n\n")
                    );

                }

            } catch (requestError) {

                console.error(
                    "TOGGLE USER ERROR:",
                    requestError
                );


                alert(
                    requestError
                        .response
                        ?.data
                        ?.error ||
                    "Gagal mengubah status profil."
                );

            } finally {

                setResetting(
                    ""
                );

            }

        };



    // =====================================================
    // LOGOUT
    // =====================================================

    const handleLogout =
        () => {

            localStorage.removeItem(
                "lingoAdminToken"
            );


            navigate(
                "/admin/login"
            );

        };


    // =====================================================
    // SALIN LINK AKSES ORANG TUA
    // =====================================================

    const handleCopyAccessLink =
        async (userId) => {

            setLinkStatus(
                (current) => ({
                    ...current,
                    [userId]: "loading"
                })
            );


            let url = "";

            try {

                const response =
                    await API.post(
                        "/access/share",
                        {
                            user_id: userId
                        }
                    );

                url =
                    response.data.url;

                await navigator.clipboard.writeText(
                    url
                );

                setLinkStatus(
                    (current) => ({
                        ...current,
                        [userId]: "copied"
                    })
                );

            } catch (error) {

                console.log(error);

                if (url) {

                    // Clipboard ditolak browser: tampilkan untuk disalin manual.
                    window.prompt(
                        "Salin link akses ini:",
                        url
                    );

                    setLinkStatus(
                        (current) => ({
                            ...current,
                            [userId]: undefined
                        })
                    );

                    return;

                }

                setLinkStatus(
                    (current) => ({
                        ...current,
                        [userId]: "error"
                    })
                );

            }


            setTimeout(
                () =>
                    setLinkStatus(
                        (current) => ({
                            ...current,
                            [userId]: undefined
                        })
                    ),
                2500
            );

        };



    // =====================================================
    // LIHAT DASHBOARD USER
    // =====================================================

    const handleViewUser =
        (userId) => {

            if (!userId) {

                return;

            }


            window.open(

                `/admin/user/${userId}`,

                "_blank",

                "noopener,noreferrer"

            );

        };


    // =====================================================
    // LIHAT DASHBOARD DARI DEVICE
    // =====================================================

    const handleViewDeviceUser =
        (userId) => {

            if (!userId) {

                return;

            }


            window.open(

                `/admin/user/${userId}`,

                "_blank",

                "noopener,noreferrer"

            );

        };


    // =====================================================
    // LOADING
    // =====================================================

    if (loading) {

        return (

            <div className="container">

                <div
                    className="profile-loading"
                >

                    Memuat data administrator...

                </div>

            </div>

        );

    }


    // =====================================================
    // RENDER
    // =====================================================

    return (

        <main className="container">


            {/* =================================================
                HEADER + TAB
            ================================================= */}

            <div className="admin-header">

                <div className="profile-header">

                    <span>
                        ADMINISTRATOR
                    </span>

                    <h1>
                        Manajemen LINGO
                    </h1>

                    <p>
                        Kelola profil anak, perangkat
                        LINGO, dan akun guru.
                    </p>

                </div>


                <button
                    type="button"
                    className="admin-logout"
                    onClick={
                        handleLogout
                    }
                >
                    Logout
                </button>

            </div>


            <div
                className="admin-tabs"
                role="tablist"
                aria-label="Bagian admin"
            >

                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "pengguna"}
                    className={activeTab === "pengguna" ? "active" : ""}
                    onClick={() => selectTab("pengguna")}
                >
                    Pengguna &amp; LINGO
                    <span className="admin-tab-count">
                        {users.length}
                    </span>
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "guru"}
                    className={activeTab === "guru" ? "active" : ""}
                    onClick={() => selectTab("guru")}
                >
                    Guru
                </button>

            </div>


            {activeTab === "guru" && (

                <TeacherManager />

            )}


            {activeTab === "pengguna" && (

            <>


            {/* =================================================
                ERROR
            ================================================= */}

            {error && (

                <div
                    style={{
                        padding:
                            "15px",

                        marginBottom:
                            "20px",

                        borderRadius:
                            "10px",

                        background:
                            "#fff0f0",

                        color:
                            "#c0392b"
                    }}
                >

                    {error}

                </div>

            )}


            {/* =================================================
                QR BARU SETELAH RESET
            ================================================= */}

            {newQR && (

                <div
                    style={{
                        padding:
                            "20px",

                        marginBottom:
                            "25px",

                        borderRadius:
                            "15px",

                        background:
                            "#eef5ff"
                    }}
                >

                    <h3>
                        LINGO berhasil di-reset
                    </h3>


                    <p>

                        LINGO:

                        {" "}

                        <strong>
                            {
                                newQR.device_id
                            }
                        </strong>

                    </p>


                    {newQR.same_qr ? (

                        <p>
                            Scan QR yang sama pada LINGO
                            ini untuk aktivasi ulang
                            dengan profil anak baru.
                        </p>

                    ) : (

                    <>

                    <p>
                        QR lama tidak tercatat.
                        QR aktivasi baru:
                    </p>


                    <input
                        type="text"
                        value={
                            newQR.activation_url
                        }
                        readOnly
                        style={{
                            width:
                                "100%",

                            marginBottom:
                                "10px"
                        }}
                    />


                    <button
                        type="button"
                        onClick={() => {

                            navigator
                                .clipboard
                                .writeText(
                                    newQR.activation_url
                                );

                            alert(
                                "Link aktivasi berhasil disalin."
                            );

                        }}
                    >

                        Salin Link Aktivasi

                    </button>

                    </>

                    )}

                </div>

            )}


            {/* =================================================
                DAFTAR PENGGUNA
            ================================================= */}

            <div
                className="table-card"
                style={{
                    overflowX:
                        "auto",

                    marginBottom:
                        "30px"
                }}
            >

                <div
                    style={{
                        display:
                            "flex",

                        justifyContent:
                            "space-between",

                        alignItems:
                            "center",

                        gap:
                            "15px",

                        flexWrap:
                            "wrap",

                        marginBottom:
                            "20px"
                    }}
                >

                    <div>

                        <h2
                            style={{
                                margin:
                                    0
                            }}
                        >

                            Pengguna LINGO

                        </h2>


                        <p
                            style={{
                                margin:
                                    "6px 0 0"
                            }}
                        >

                            Pilih pengguna untuk
                            melihat Dashboard,
                            History, dan Report.

                        </p>

                    </div>

                </div>


                {users.length === 0 ? (

                    <div
                        style={{
                            padding:
                                "35px",

                            textAlign:
                                "center"
                        }}
                    >

                        <p>
                            Belum ada pengguna
                            terdaftar.
                        </p>

                    </div>

                ) : (

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    USER ID
                                </th>

                                <th>
                                    Nama Anak
                                </th>

                                <th>
                                    Umur
                                </th>

                                <th>
                                    Dibuat
                                </th>

                                <th>
                                    Status
                                </th>

                                <th>
                                    Aksi
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            {users.map(
                                (user) => (

                                    <tr
                                        key={
                                            user.id
                                        }
                                    >

                                        <td>

                                            <strong>
                                                {
                                                    user.id
                                                }
                                            </strong>

                                        </td>


                                        <td>

                                            {
                                                user.name ||
                                                "-"
                                            }

                                        </td>


                                        <td>

                                            {
                                                user.age
                                                    ? `${user.age} tahun`
                                                    : "-"
                                            }

                                        </td>


                                        <td>

                                            {
                                                user.created_at

                                                    ?

                                                    new Date(
                                                        user.created_at
                                                    ).toLocaleDateString(
                                                        "id-ID",
                                                        {
                                                            day:
                                                                "numeric",

                                                            month:
                                                                "long",

                                                            year:
                                                                "numeric"
                                                        }
                                                    )

                                                    :

                                                    "-"
                                            }

                                        </td>


                                        <td>

                                            <span
                                                className={
                                                    user.active === false
                                                        ? "admin-status inactive"
                                                        : "admin-status"
                                                }
                                            >
                                                {user.active === false
                                                    ? "Nonaktif"
                                                    : "Aktif"
                                                }
                                            </span>

                                        </td>


                                        <td>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleViewUser(
                                                        user.id
                                                    )
                                                }
                                                style={{
                                                    marginRight:
                                                        "8px"
                                                }}
                                            >

                                                Lihat Dashboard

                                            </button>


                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleCopyAccessLink(
                                                        user.id
                                                    )
                                                }
                                                disabled={
                                                    linkStatus[user.id] ===
                                                    "loading" ||
                                                    user.active === false
                                                }
                                            >

                                                {{
                                                    loading:
                                                        "Membuat link...",
                                                    copied:
                                                        "Link disalin!",
                                                    error:
                                                        "Gagal, coba lagi"
                                                }[linkStatus[user.id]] ||
                                                    "Salin Link Akses"
                                                }

                                            </button>


                                            <button
                                                type="button"
                                                className={
                                                    user.active === false
                                                        ? undefined
                                                        : "admin-danger-button"
                                                }
                                                onClick={() =>
                                                    handleToggleUser(
                                                        user
                                                    )
                                                }
                                                disabled={
                                                    resetting ===
                                                    `profil:${user.id}`
                                                }
                                                style={{
                                                    marginLeft:
                                                        "8px"
                                                }}
                                            >

                                                {user.active === false
                                                    ? "Aktifkan"
                                                    : "Nonaktifkan"
                                                }

                                            </button>

                                        </td>

                                    </tr>

                                )
                            )}

                        </tbody>

                    </table>

                )}

            </div>


            {/* =================================================
                DAFTAR PERANGKAT LINGO
            ================================================= */}

            <div
                className="table-card"
                style={{
                    overflowX:
                        "auto"
                }}
            >

                <div
                    style={{
                        marginBottom:
                            "20px"
                    }}
                >

                    <h2
                        style={{
                            margin:
                                0
                        }}
                    >

                        Perangkat LINGO

                    </h2>


                    <p
                        style={{
                            margin:
                                "6px 0 0"
                        }}
                    >

                        Kelola pasangan LINGO
                        dengan profil anak.

                    </p>

                </div>


                {devices.length === 0 ? (

                    <div
                        style={{
                            padding:
                                "50px",

                            textAlign:
                                "center"
                        }}
                    >

                        <h3>
                            Belum ada LINGO aktif
                        </h3>


                        <p>
                            Belum ada perangkat
                            yang terdaftar.
                        </p>

                    </div>

                ) : (

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    LINGO ID
                                </th>

                                <th>
                                    USER ID
                                </th>

                                <th>
                                    Nama Anak
                                </th>

                                <th>
                                    Umur
                                </th>

                                <th>
                                    Terakhir Kirim Data
                                </th>

                                <th>
                                    Status
                                </th>

                                <th>
                                    Aksi
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            {devices.map(
                                (device) => (

                                    <tr
                                        key={
                                            device.device_id
                                        }
                                    >

                                        <td>

                                            <strong>
                                                {
                                                    device.device_id
                                                }
                                            </strong>

                                        </td>


                                        <td>

                                            {
                                                device.user_id ||
                                                "-"
                                            }

                                        </td>


                                        <td>

                                            {
                                                device.name ||
                                                "-"
                                            }

                                        </td>


                                        <td>

                                            {
                                                device.age
                                                    ? `${device.age} tahun`
                                                    : "-"
                                            }

                                        </td>


                                        <td>

                                            {formatLastSeen(
                                                device.last_seen_at
                                            )}

                                        </td>


                                        <td>

                                            <span
                                                className={
                                                    device.status === "available"
                                                        ? "admin-status inactive"
                                                        : "admin-status"
                                                }
                                            >
                                                {device.status === "available"
                                                    ? "Belum dipakai"
                                                    : "Terpasang"
                                                }
                                            </span>

                                        </td>


                                        <td>

                                            {device.user_id && (

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleViewDeviceUser(
                                                            device.user_id
                                                        )
                                                    }
                                                    style={{
                                                        marginRight:
                                                            "8px"
                                                    }}
                                                >

                                                    Lihat Dashboard

                                                </button>

                                            )}


                                            {device.user_id && (

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleReset(
                                                        device.device_id
                                                    )
                                                }
                                                disabled={
                                                    resetting ===
                                                    device.device_id
                                                }
                                                style={{
                                                    marginRight:
                                                        "8px"
                                                }}
                                            >

                                                {
                                                    resetting ===
                                                    device.device_id

                                                        ?

                                                        "Mereset..."

                                                        :

                                                        "Reset LINGO"
                                                }

                                            </button>

                                            )}


                                            <button
                                                type="button"
                                                className="admin-danger-button"
                                                onClick={() =>
                                                    handleDeleteDevice(
                                                        device.device_id
                                                    )
                                                }
                                                disabled={
                                                    resetting ===
                                                    `hapus:${device.device_id}`
                                                }
                                            >

                                                {
                                                    resetting ===
                                                    `hapus:${device.device_id}`
                                                        ? "Menghapus..."
                                                        : "Hapus LINGO"
                                                }

                                            </button>

                                        </td>

                                    </tr>

                                )
                            )}

                        </tbody>

                    </table>

                )}

            </div>


            </>

            )}


        </main>

    );

}


export default AdminDashboard;
