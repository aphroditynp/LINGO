import {Link} from "react-router-dom";


function Navbar(){

return(

<nav>


<h2>
LINGO
</h2>


<div>

<Link to="/">
Dashboard
</Link>


<Link to="/history">
History
</Link>


<Link to="/report">
Report
</Link>


</div>


</nav>

)

}


export default Navbar;