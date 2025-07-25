
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './UnderConstructionPage.css';

export default function UnderConstructionPage() {
    return (
      <div className="app-container">
        <Sidebar />
        <TopBar />
  
        <main className="main-content">
            <h1>Page Under Construction! Check back soon :)
            </h1>
      </main>
        </div>
    )
}
