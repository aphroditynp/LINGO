import TeacherManager from "../components/TeacherManager";
import {
    useEffect,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import API from "../api";


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

                    `Apakah kamu yakin ingin mereset ${deviceId}?\n\n` +

                    `Data history belajar tidak akan dihapus.\n` +

                    `LINGO akan mendapatkan QR aktivasi baru.`

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
                HEADER
            ================================================= */}

            <div
                className="profile-header"
                style={{
                    marginBottom:
                        "35px"
                }}
            >

                <span>
                    ADMINISTRATOR
                </span>


                <h1>
                    Manajemen LINGO
                </h1>


                <p>
                    Kelola perangkat LINGO
                    dan profil anak yang terhubung.
                </p>

            </div>


            <TeacherManager />

            {/* =================================================
                LOGOUT
            ================================================= */}

            <div
                style={{
                    display:
                        "flex",

                    justifyContent:
                        "flex-end",

                    marginBottom:
                        "20px"
                }}
            >

                <button
                    type="button"
                    onClick={
                        handleLogout
                    }
                >

                    Logout

                </button>

            </div>


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


                    <p>
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
                                                    "loading"
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

                                            <span
                                                style={{
                                                    display:
                                                        "inline-block",

                                                    padding:
                                                        "6px 12px",

                                                    borderRadius:
                                                        "20px",

                                                    background:
                                                        "#e8f8ef",

                                                    color:
                                                        "#24955a",

                                                    fontSize:
                                                        "13px",

                                                    fontWeight:
                                                        "600"
                                                }}
                                            >

                                                Aktif

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

                                        </td>

                                    </tr>

                                )
                            )}

                        </tbody>

                    </table>

                )}

            </div>


        </main>

    );

}


export default AdminDashboard;