import { mount } from 'svelte';
import App from './App.svelte';
import '~/assets/tailwind.css';

const target = document.getElementById('app');
if (!target) throw new Error('popup root #app missing');

mount(App, { target });
