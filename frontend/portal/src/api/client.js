import axios from 'axios';

const API_URL = 'http://69.62.105.119:5001/api';

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export default apiClient;