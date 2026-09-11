import {
    useState
} from "react";

import {
    Link,
    useLocation
} from "react-router-dom";


function Navbar() {


    const [menuOpen, setMenuOpen] =
        useState(false);


    const location =
        useLocation();


    const closeMenu = () => {

        setMenuOpen(false);

    };


    return (

        <nav className="navbar">


            {/* LOGO */}

            <Link
                to="/"
                className="navbar-logo"
                onClick={closeMenu}
            >

                LINGO

            </Link>



            {/* DESKTOP MENU */}

            <div className="navbar-links">


                <Link
                    to="/"
                    className={
                        location.pathname === "/"
                            ? "nav-active"
                            : ""
                    }
                >

                    Dashboard

                </Link>


                <Link
                    to="/history"
                    className={
                        location.pathname === "/history"
                            ? "nav-active"
                            : ""
                    }
                >

                    History

                </Link>


                <Link
                    to="/report"
                    className={
                        location.pathname === "/report"
                            ? "nav-active"
                            : ""
                    }
                >

                    Report

                </Link>


                <Link
                    to="/profile"
                    className={
                        location.pathname === "/profile"
                            ? "nav-active"
                            : ""
                    }
                >

                    Profile

                </Link>


            </div>



            {/* MOBILE BUTTON */}

            <button
                className={
                    `navbar-toggle ${
                        menuOpen
                            ? "open"
                            : ""
                    }`
                }

                onClick={() =>
                    setMenuOpen(
                        !menuOpen
                    )
                }

                aria-label="Buka menu"
            >

                <span></span>

                <span></span>

                <span></span>

            </button>



            {/* MOBILE MENU */}

            <div
                className={
                    `mobile-menu ${
                        menuOpen
                            ? "mobile-menu-open"
                            : ""
                    }`
                }
            >


                <Link
                    to="/"
                    onClick={closeMenu}
                    className={
                        location.pathname === "/"
                            ? "mobile-active"
                            : ""
                    }
                >

                    Dashboard

                </Link>


                <Link
                    to="/history"
                    onClick={closeMenu}
                    className={
                        location.pathname === "/history"
                            ? "mobile-active"
                            : ""
                    }
                >

                    History

                </Link>


                <Link
                    to="/report"
                    onClick={closeMenu}
                    className={
                        location.pathname === "/report"
                            ? "mobile-active"
                            : ""
                    }
                >

                    Report

                </Link>


                <Link
                    to="/profile"
                    onClick={closeMenu}
                    className={
                        location.pathname === "/profile"
                            ? "mobile-active"
                            : ""
                    }
                >

                    Profile

                </Link>


            </div>


        </nav>

    );

}


export default Navbar;