import {
BrowserRouter,
Routes,
Route
}
from "react-router-dom";


import Navbar from "./components/Navbar";


import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Report from "./pages/Report";
import Profile from "./pages/Profile";
import RegisterDevice from "./pages/RegisterDevice";


function App(){


return (

<BrowserRouter>


<Navbar />


<Routes>

<Route
path="/register-device"
element={<RegisterDevice />}
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
    element={<Profile />}
/>

</Routes>


</BrowserRouter>


)


}


export default App;