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


    const [loading, setLoading] =
        useState(true);


    const [error, setError] =
        useState("");


    const [resetting, setResetting] =
        useState("");


    const [newQR, setNewQR] =
        useState(null);


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


    const loadDevices =
        async () => {

            try {

                setLoading(true);

                setError("");


                const response =
                    await API.get(
                        "/admin/devices",
                        adminConfig
                    );


                setDevices(
                    response.data
                );


            } catch (requestError) {

                console.log(
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
                    "Gagal mengambil data perangkat."
                );


            } finally {

                setLoading(false);

            }

        };


    useEffect(() => {

        if (!token) {

            navigate(
                "/admin/login"
            );

            return;

        }


        loadDevices();

    }, []);


    const handleReset =
        async (deviceId) => {

            const confirmed =
                window.confirm(

                    `Apakah kamu yakin ingin mereset ${deviceId}? ` +
                    `Data history belajar tidak akan dihapus.`

                );


            if (!confirmed) {

                return;

            }


            try {

                setResetting(
                    deviceId
                );


                setNewQR(null);


                const response =
                    await API.post(

                        `/admin/devices/${deviceId}/reset`,

                        {},

                        adminConfig

                    );


                setNewQR(
                    response.data
                );


                await loadDevices();


            } catch (requestError) {

                console.log(
                    requestError
                );


                alert(
                    requestError
                        .response
                        ?.data
                        ?.error ||
                    "Reset gagal."
                );


            } finally {

                setResetting(
                    ""
                );

            }

        };


    const handleLogout =
        () => {

            localStorage.removeItem(
                "lingoAdminToken"
            );


            navigate(
                "/admin/login"
            );

        };


    if (loading) {

        return (

            <div className="container">

                <div className="profile-loading">

                    Memuat data administrator...

                </div>

            </div>

        );

    }


    return (

        <main className="container">

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
                    Kelola perangkat LINGO dan
                    profil anak yang terhubung.
                </p>

            </div>


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
                            {newQR.device_id}
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
                                    newQR
                                        .activation_url
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


            <div
                className="table-card"
                style={{
                    overflowX:
                        "auto"
                }}
            >

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
                                                device.name
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

                                                {resetting ===
                                                device.device_id

                                                    ? "Mereset..."

                                                    : "Reset LINGO"

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