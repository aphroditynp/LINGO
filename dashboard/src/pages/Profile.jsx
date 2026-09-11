import {
    useEffect,
    useState
} from "react";

import API from "../api";


function Profile() {

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



    // Ambil profil
    useEffect(() => {

        API.get(
            "/users/BIMA001"
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
                    "/users/BIMA001",
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
                                "BIMA001"
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


        </div>

    );

}


export default Profile;