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



function App(){


return (

<BrowserRouter>


<Navbar />


<Routes>


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


</Routes>


</BrowserRouter>


)


}


export default App;