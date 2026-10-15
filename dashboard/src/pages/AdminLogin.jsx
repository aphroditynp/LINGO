import {
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import API from "../api";


function AdminLogin() {

    const navigate =
        useNavigate();


    const [username, setUsername] =
        useState("");


    const [password, setPassword] =
        useState("");


    const [loading, setLoading] =
        useState(false);


    const [error, setError] =
        useState("");


    const handleSubmit =
        async (event) => {

            event.preventDefault();

            setError("");

            setLoading(true);


            try {

                const response =
                    await API.post(
                        "/admin/login",
                        {
                            username,
                            password
                        }
                    );


                localStorage.setItem(
                    "lingoAdminToken",
                    response.data.token
                );


                navigate(
                    "/admin"
                );


            } catch (requestError) {

                setError(
                    requestError
                        .response
                        ?.data
                        ?.error ||
                    "Login gagal."
                );


            } finally {

                setLoading(false);

            }

        };


    return (

        <main className="container">

            <div
                className="profile-form-card"
                style={{
                    maxWidth: "500px",
                    margin:
                        "80px auto"
                }}
            >

                <div
                    className="profile-header"
                    style={{
                        marginBottom:
                            "30px"
                    }}
                >

                    <span>
                        ADMINISTRATOR
                    </span>


                    <h1>
                        Login Admin
                    </h1>


                    <p>
                        Masuk untuk mengelola
                        perangkat dan profil LINGO.
                    </p>

                </div>


                <form
                    onSubmit={
                        handleSubmit
                    }
                >

                    <label>
                        Username
                    </label>


                    <input
                        type="text"
                        value={username}
                        onChange={
                            (event) =>
                                setUsername(
                                    event.target.value
                                )
                        }
                        autoComplete="username"
                        required
                    />


                    <label>
                        Password
                    </label>


                    <input
                        type="password"
                        value={password}
                        onChange={
                            (event) =>
                                setPassword(
                                    event.target.value
                                )
                        }
                        autoComplete="current-password"
                        required
                    />


                    {error && (

                        <p
                            style={{
                                color:
                                    "#d9534f",
                                marginTop:
                                    "15px"
                            }}
                        >
                            {error}
                        </p>

                    )}


                    <button
                        type="submit"
                        disabled={loading}
                    >

                        {loading
                            ? "Memeriksa..."
                            : "Login Administrator"
                        }

                    </button>

                </form>

            </div>

        </main>

    );

}


export default AdminLogin;