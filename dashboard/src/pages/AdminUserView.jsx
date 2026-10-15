import {
    Link,
    Navigate,
    useLocation,
    useParams
} from "react-router-dom";


import Dashboard
from "./Dashboard";

import History
from "./History";

import Report
from "./Report";


function AdminUserView() {

    const {
        userId
    } = useParams();


    const location =
        useLocation();


    const token =
        localStorage.getItem(
            "lingoAdminToken"
        );


    // =====================================================
    // CEK LOGIN ADMIN
    // =====================================================

    if (!token) {

        return (

            <Navigate
                to="/admin/login"
                replace
            />

        );

    }


    // =====================================================
    // PATH
    // =====================================================

    const basePath =
        `/admin/user/${userId}`;


    const isHistory =
        location.pathname.endsWith(
            "/history"
        );


    const isReport =
        location.pathname.endsWith(
            "/report"
        );


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
                        "20px"
                }}
            >

                <span>
                    ADMINISTRATOR
                </span>


                <h1>
                    Dashboard Pengguna
                </h1>


                <p>

                    Admin sedang melihat
                    data pengguna dengan ID{" "}

                    <strong>
                        {userId}
                    </strong>.

                </p>

            </div>


            {/* =================================================
                NAVIGASI USER
            ================================================= */}

            <div
                style={{
                    display:
                        "flex",

                    gap:
                        "10px",

                    flexWrap:
                        "wrap",

                    marginBottom:
                        "30px"
                }}
            >

                {/* DASHBOARD */}

                <Link
                    to={basePath}
                    style={{
                        textDecoration:
                            "none",

                        padding:
                            "10px 16px",

                        borderRadius:
                            "10px",

                        background:

                            !isHistory &&
                            !isReport

                                ?

                                "var(--lingo-blue)"

                                :

                                "#fff",

                        color:

                            !isHistory &&
                            !isReport

                                ?

                                "#fff"

                                :

                                "var(--text-main)",

                        border:
                            "1px solid var(--border)",

                        fontWeight:
                            600
                    }}
                >

                    Dashboard

                </Link>


                {/* HISTORY */}

                <Link
                    to={`${basePath}/history`}
                    style={{
                        textDecoration:
                            "none",

                        padding:
                            "10px 16px",

                        borderRadius:
                            "10px",

                        background:
                            isHistory

                                ?

                                "var(--lingo-blue)"

                                :

                                "#fff",

                        color:
                            isHistory

                                ?

                                "#fff"

                                :

                                "var(--text-main)",

                        border:
                            "1px solid var(--border)",

                        fontWeight:
                            600
                    }}
                >

                    History

                </Link>


                {/* REPORT */}

                <Link
                    to={`${basePath}/report`}
                    style={{
                        textDecoration:
                            "none",

                        padding:
                            "10px 16px",

                        borderRadius:
                            "10px",

                        background:
                            isReport

                                ?

                                "var(--lingo-blue)"

                                :

                                "#fff",

                        color:
                            isReport

                                ?

                                "#fff"

                                :

                                "var(--text-main)",

                        border:
                            "1px solid var(--border)",

                        fontWeight:
                            600
                    }}
                >

                    Report

                </Link>


                {/* KEMBALI */}

                <Link
                    to="/admin"
                    style={{
                        textDecoration:
                            "none",

                        padding:
                            "10px 16px",

                        borderRadius:
                            "10px",

                        background:
                            "#fff",

                        color:
                            "var(--text-main)",

                        border:
                            "1px solid var(--border)",

                        fontWeight:
                            600
                    }}
                >

                    Kembali ke Admin

                </Link>

            </div>


            {/* =================================================
                DASHBOARD
            ================================================= */}

            {!isHistory &&
                !isReport && (

                    <Dashboard
                        userIdOverride={
                            userId
                        }
                    />

                )}


            {/* =================================================
                HISTORY
            ================================================= */}

            {isHistory && (

                <History
                    userIdOverride={
                        userId
                    }
                />

            )}


            {/* =================================================
                REPORT
            ================================================= */}

            {isReport && (

                <Report
                    userIdOverride={
                        userId
                    }
                />

            )}

        </main>

    );

}


export default AdminUserView;