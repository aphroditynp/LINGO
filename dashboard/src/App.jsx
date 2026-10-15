import {
    BrowserRouter,
    Routes,
    Route
} from "react-router-dom";


import Navbar from "./components/Navbar";


import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Report from "./pages/Report";
import Profile from "./pages/Profile";
import RegisterDevice from "./pages/RegisterDevice";

import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";


function App() {


    return (

        <BrowserRouter>


            <Navbar />


            <Routes>


                <Route
                    path="/register-device"
                    element={
                        <RegisterDevice />
                    }
                />


                <Route
                    path="/"
                    element={
                        <Dashboard />
                    }
                />


                <Route
                    path="/history"
                    element={
                        <History />
                    }
                />


                <Route
                    path="/report"
                    element={
                        <Report />
                    }
                />


                <Route
                    path="/profile"
                    element={
                        <Profile />
                    }
                />


                {/* =====================
                    ADMIN
                ===================== */}

                <Route
                    path="/admin/login"
                    element={
                        <AdminLogin />
                    }
                />


                <Route
                    path="/admin"
                    element={
                        <AdminDashboard />
                    }
                />


            </Routes>


        </BrowserRouter>

    );

}


export default App;