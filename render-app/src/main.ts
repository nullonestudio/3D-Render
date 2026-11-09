import './ui/styles.css';
import { App } from './app/App';

const appContainer = document.getElementById('app');
if (!appContainer) throw new Error('No #app element found');

new App(appContainer);
