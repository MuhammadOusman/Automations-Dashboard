import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import axios from 'axios';
import './App.css';

// Replace these placeholders with your actual Supabase and n8n details
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_KEY;
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function App() {
  const [chatInput, setChatInput] = useState('');
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [filters, setFilters] = useState({ phone: false, email: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch data from Supabase
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .order('last_scraped_at', { ascending: false });

    if (error) {
      setError('Error fetching data: ' + error.message);
    } else {
      setData(contacts || []);
      applyFilters(contacts || [], filters);
    }
    setLoading(false);
  };

  // Apply filters to data
  const applyFilters = (rawData, currentFilters) => {
    let filtered = rawData;
    if (currentFilters.phone) {
      filtered = filtered.filter(item => item.phone && item.phone.trim() !== '');
    }
    if (currentFilters.email) {
      filtered = filtered.filter(item => item.email && item.email.trim() !== '');
    }
    setFilteredData(filtered);
  };

  // Toggle filter
  const toggleFilter = (filterName) => {
    const newFilters = { ...filters, [filterName]: !filters[filterName] };
    setFilters(newFilters);
    applyFilters(data, newFilters);
  };

  // Show all data
  const showAll = () => {
    setFilters({ phone: false, email: false });
    setFilteredData(data);
  };

  // Clear all rows from DB and table
  const clearData = async () => {
    if (window.confirm('Are you sure you want to delete all data?')) {
      setLoading(true);
      const { error } = await supabase.from('contacts').delete().neq('id', 0);
      if (error) {
        setError('Error clearing data: ' + error.message);
      } else {
        setData([]);
        setFilteredData([]);
      }
      setLoading(false);
    }
  };

  // Download as Excel
  const downloadExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
    XLSX.writeFile(workbook, 'contacts.xlsx');
  };

  // Trigger n8n workflow
  const triggerWorkflow = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await axios.post(N8N_WEBHOOK_URL, { chatInput });
      alert('Workflow triggered successfully!');
      setChatInput('');
    } catch (err) {
      setError('Error triggering workflow: ' + (err.response?.data?.message || err.message));
    }
    setLoading(false);
  };

  // Realtime subscription to Supabase changes
  useEffect(() => {
    fetchData();

    const subscription = supabase
      .channel('contacts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  return (
    <div className="App">
      <h1>Pathfinder Dashboard</h1>

      <section>
        <h2>Trigger Automation</h2>
        <form onSubmit={triggerWorkflow}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Enter profession and location (e.g., plumbers in manchester)"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>Trigger</button>
        </form>
      </section>

      <section>
        <h2>Data from Supabase</h2>
        {error && <p className="error">{error}</p>}
        {loading && <p>Loading...</p>}
        <div className="controls">
          <button onClick={fetchData} disabled={loading}>Refresh Data</button>
          <button onClick={() => toggleFilter('phone')} disabled={loading}>
            {filters.phone ? 'Remove Phone Filter' : 'Filter Non-Empty Phones'}
          </button>
          <button onClick={() => toggleFilter('email')} disabled={loading}>
            {filters.email ? 'Remove Email Filter' : 'Filter Non-Empty Emails'}
          </button>
          <button onClick={showAll} disabled={loading}>Show All</button>
          <button onClick={clearData} disabled={loading}>Clear All Data</button>
          <button onClick={downloadExcel} disabled={loading || filteredData.length === 0}>Download Excel</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Business Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Website</th>
              <th>Address</th>
              <th>Source URL</th>
              <th>Last Scraped At</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((item, index) => (
              <tr key={index}>
                <td>{item.business_name || '-'}</td>
                <td>{item.email || '-'}</td>
                <td>{item.phone || '-'}</td>
                <td>{item.website ? <a href={item.website} target="_blank" rel="noopener noreferrer">{item.website}</a> : '-'}</td>
                <td>{item.address || '-'}</td>
                <td>{item.source_url ? <a href={item.source_url} target="_blank" rel="noopener noreferrer">{item.source_url}</a> : '-'}</td>
                <td>{item.last_scraped_at ? new Date(item.last_scraped_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default App;