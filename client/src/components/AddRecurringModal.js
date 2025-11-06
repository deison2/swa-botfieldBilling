import { useState, useEffect } from "react";
import Modal from "react-modal";
import { MultiSelect } from "react-multi-select-component";
import { toast, ToastContainer } from "react-toastify";
import "./EditNarrativeModal.css";

import {
  loadServMapping
} from '../services/RecurringService.js';

import { getStandards } from '../services/OfficePartnerClientStandards';

Modal.setAppElement("#root");

const initialFormState = {
  BillType: "",
  Level: "",
  Population: [],
  Frequency: "",
  Narrative: "",
  BillAmount: "",
  ContIndex: null,
};

export default function AddRecurringModal({ isOpen, onRequestClose, onSave, availableJobs, allData }) {
  const [form, setForm] = useState(initialFormState);
  const [populationOptions, setPopulationOptions] = useState([]);
  const [selectedPopulations, setSelectedPopulations] = useState([]);


  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  console.log(selectedClient);

  useEffect(() => {
    if (isOpen) {
      setForm(initialFormState);
      setSelectedPopulations([]);
      setPopulationOptions([]);
      setClientQuery("");
      setClientResults([]);
      setSelectedClient(null);
    }
  }, [isOpen]);

  // Update population options dynamically based on Level
  useEffect(() => {
    if (form.Level=== "Job") {
      setPopulationOptions(availableJobs);
    } else if (form.Level === "Serv") {
      setPopulationOptions(
        loadServMapping.map((s) => ({ label: s.SERVINDEX, value: s.SERVINDEX }))
      );
    }
  }, [form.Level, availableJobs]);

  // General form handler
  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Population select handler
  function handlePopulationChange(selected) {
    setSelectedPopulations(selected);
    setForm((prev) => ({
      ...prev,
      Population: selected.map((p) => p.value),
    }));
  }

  // 🕐 Debounced client search
  useEffect(() => {
    if (clientQuery.length < 3) {
      setClientResults([]);
      return;
    }

    const handler = setTimeout(async () => {
      setIsLoadingClients(true);
      try {
        const results = await getStandards('client', clientQuery); // should return [{ ContIndex, ClientCode, ClientName, ClientOffice }]
        setClientResults(results);
      } catch (err) {
        console.error("Error loading clients:", err);
        toast.error("Failed to load clients");
      } finally {
        setIsLoadingClients(false);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [clientQuery]);

  // When client is selected
  const handleClientSelect = (client) => {
    setSelectedClient(client);
    setForm((prev) => ({ ...prev, ContIndex: client.ContIndex }));
    setClientResults([]); // hide dropdown
    setClientQuery(`${client.ClientCode} - ${client.ClientName}`);
  };

  // Validation + Save
  function handleSubmit(e) {
    e.preventDefault();

    const { BillType, Level, Population, Frequency, Narrative, BillAmount, ContIndex } = form;

    if (!ContIndex) return toast.error("Please select a Client");
    if (!BillType) return toast.error("Please select a Bill Type");
    if (!Level) return toast.error("Please select a Level");
    if (!Population.length) return toast.error("Please select at least one Population");
    if (!Frequency) return toast.error("Please select a Frequency");
    if (!Narrative.trim()) return toast.error("Narrative cannot be empty");
    if (!BillAmount || isNaN(BillAmount)) return toast.error("Please enter a valid Bill Amount");

    onSave(form);
    onRequestClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName="overlay"
      className="modal"
      contentLabel="Create/Request Recurring"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <h2>Create/Request Recurring</h2>

      <form onSubmit={handleSubmit} className="edit-form rsmc">
        {/* 🧾 Client Field */}
        <label>
          Client
          <input
            type="text"
            placeholder="Start typing client name..."
            value={clientQuery}
            onChange={(e) => {
              setClientQuery(e.target.value);
              setSelectedClient(null);
              setForm((prev) => ({ ...prev, ContIndex: null }));
            }}
          />
          {isLoadingClients && <div>Loading...</div>}

          {clientResults.length > 0 && (
            <ul className="client-dropdown">
              {clientResults.map((client) => (
                <li
                  key={client.ContIndex}
                  onClick={() => handleClientSelect(client)}
                >
                  <strong>{client.ClientCode}</strong> — {client.ClientName} ({client.ClientOffice})
                </li>
              ))}
            </ul>
          )}
        </label>

        {/* Bill Type */}
        <label>
          Bill Type
          <select name="BillType" value={form.BillType} onChange={handleChange} required>
            <option value="" disabled>— select type —</option>
            <option value="PROGRESS">PROGRESS</option>
            <option value="INTERIM">INTERIM</option>
          </select>
        </label>

        {/* Level */}
        <label>
          Level
          <select name="Level" value={form.Level} onChange={handleChange} required>
            <option value="" disabled>— select level —</option>
            <option value="JOB">JOB</option>
            <option value="SERV">SERV</option>
          </select>
        </label>

        {/* Population */}
        {form.Level && (
          <label>
            Population
            <MultiSelect
              options={populationOptions}
              value={selectedPopulations}
              onChange={handlePopulationChange}
              labelledBy="Select population"
              hasSelectAll={false}
              ClearSelectedIcon={null}
            />
          </label>
        )}

        {/* Frequency */}
        <label>
          Frequency
          <select name="Frequency" value={form.Frequency} onChange={handleChange} required>
            <option value="" disabled>— select frequency —</option>
            <option value="MONTHLY">MONTHLY</option>
            <option value="QUARTERLY">QUARTERLY</option>
          </select>
        </label>

        {/* Narrative */}
        <label>
          Narrative
          <textarea
            name="Narrative"
            value={form.Narrative}
            onChange={handleChange}
            placeholder="Enter narrative..."
          />
        </label>

        {/* Bill Amount */}
        <label>
          Bill Amount
          <input
            type="number"
            name="BillAmount"
            value={form.BillAmount}
            onChange={handleChange}
            placeholder="Enter amount"
            min="0"
            step="0.01"
          />
        </label>

        {/* Buttons */}
        <div className="buttons">
          <button type="button" onClick={onRequestClose}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>

      <ToastContainer position="top-right" autoClose={3000} />
    </Modal>
  );
}
