// src/components/EditRecurringModal.js
import { useState, useEffect, useMemo } from "react";
import Modal from "react-modal";
import { MultiSelect } from "react-multi-select-component";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./EditNarrativeModal.css";

import { loadRecurringJobMapping, loadServMapping } from "../services/RecurringService.js";

// Dynamically load service mapping based on environment
/*
const servData = await loadServMapping().catch((err) => {
  console.error(err);
  return services;
});

const servMapping = servData.map((item) => item.SERVINDEX);
*/

Modal.setAppElement("#root");

export default function EditRecurringModal({
  isOpen,
  onRequestClose,
  initialData,
  onSave,
  onDelete
}) {

  const initialFormState = {
    uuid: "",
    BillType: "",
    Level: "",
    Population: [],
    Frequency: "",
    Narrative: "",
    BillAmount: "",
  };
  
  const [form, setForm] = useState(initialFormState);
  const [jobMappingData, setJobMappingData] = useState([]);
  const [jobLookup, setJobLookup] = useState({});
  const [selectedOptions, setSelectedOptions] = useState(form.Population);
  const [populationOptions, setPopulationOptions] = useState([]);



async function loadPopulationOptions(level) {
  try {
    if (!level) return;

    if (level.toLowerCase() === "job") {
      const data = await loadRecurringJobMapping();
      const sorted = data.sort((a, b) => a.JobName.localeCompare(b.JobName));

      const jobOpts = sorted.map((j) => ({
        label: j.JobName,
        value: j.Idx,
        serv: j.Serv,
      }));

      setPopulationOptions(jobOpts);
      setSelectedOptions([]);
      setForm(prev => ({ ...prev, Population: [] }));
    }

    if (level.toLowerCase() === "serv") {
      const servData = await loadServMapping().catch((err) => {
        console.error(err);
        return [];
      });

      const servMappingSorted = servData
        .map((item) => item.SERVINDEX)
        .sort((a, b) => a.localeCompare(b));

      const servOptions = servMappingSorted.map((s) => ({
        label: s,
        value: s,
      }));

      setPopulationOptions(servOptions);
      setSelectedOptions([]);
      setForm(prev => ({ ...prev, Population: [] }));
    }
  } catch (err) {
    console.error("Failed to load population options:", err);
  }
}



useEffect(() => {
  if (!isOpen || !form.Level) return;

  // Don’t reset if we’re just populating initialData
  if (initialData && form.uuid === initialData.uuid) return;


  loadPopulationOptions();
}, [form.Level, isOpen, initialData, form.uuid]);




useEffect(() => {
  if (!isOpen || !initialData?.Level) return;

  (async () => {
    try {
      const level = initialData.Level?.toLowerCase();
      let options = [];
      let lookup = {};

      if (level === "job") {
        const jobData = await loadRecurringJobMapping();
        const sorted = jobData.sort((a, b) =>
          a.JobName.localeCompare(b.JobName)
        );
        lookup = sorted.reduce((acc, { JobName, Idx }) => {
          acc[JobName] = Idx;
          return acc;
        }, {});
        options = sorted.map((j) => ({
          label: j.JobName,
          value: j.Idx,
        }));

        // Map existing Population (JobNames or Idx) to Idx values
        const mappedPopulation = initialData.Population.map((p) =>
          typeof p === "number" ? p : lookup[p] || p
        );

        const selected = options.filter((opt) =>
          mappedPopulation.includes(opt.value)
        );

        setPopulationOptions(options);
        setSelectedOptions(selected);
        setForm({
          ...initialData,
          Population: mappedPopulation,
        });
      }

      if (level === "serv") {
        const servData = await loadServMapping();
        const sorted = servData
          .map((s) => s.SERVINDEX)
          .sort((a, b) => a.localeCompare(b));

        options = sorted.map((s) => ({
          label: s,
          value: s,
        }));

        // Map existing Population to matching SERVINDEX values
        const mappedPopulation = initialData.Population.map((p) =>
          sorted.includes(p) ? p : p.toString()
        );

        const selected = options.filter((opt) =>
          mappedPopulation.includes(opt.value)
        );

        setPopulationOptions(options);
        setSelectedOptions(selected);
        setForm({
          ...initialData,
          Population: mappedPopulation,
        });
      }
    } catch (err) {
      console.error("Failed to load mapping for edit modal:", err);
      toast.error("Failed to load mapping data.");
    }
  })();
}, [isOpen, initialData]);




function handlePopulationChange(selected) {
  // Always keep selected options alphabetized by label
  const sortedSelected = [...selected].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  setSelectedOptions(sortedSelected);

  // Also update the form’s Population field in the same order
  setForm(prev => ({
    ...prev,
    Population: sortedSelected.map(p => p.label),
  }));
}


function handleChange(e) {
  const { name, value } = e.target;

  if (name.toLowerCase() === "level") {
    setSelectedOptions([]);
    setForm(prev => ({
      ...prev,
      Population: [],
      Level: value
    }));
  } else {
    setForm(prev => ({ ...prev, [name]: value }));
  }
}

useEffect(() => {
  if (!isOpen || !form.Level) return;
  if (initialData && form.uuid === initialData.uuid) return;
  loadPopulationOptions(form.Level);
}, [form.Level]);



  function handleSubmit(e) {
    e.preventDefault();

    const { BillType, Level, Population, Frequency, Narrative, BillAmount } = form;

    if (!BillType) return toast.error("Please select a Bill Type");
    if (!Level) return toast.error("Please select a Level");
    if (!Population.length) return toast.error("Please select at least one Population");
    if (!Frequency) return toast.error("Please select a Frequency");
    if (!Narrative.trim()) return toast.error("Narrative cannot be empty");
    if (!BillAmount || isNaN(BillAmount))
      return toast.error("Please enter a valid Bill Amount");

    onSave(form);
    onRequestClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName="overlay"
      className="modal"
      contentLabel="Edit Recurring Job"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <h2>Edit Recurring Job</h2>

      <form onSubmit={handleSubmit} className="edit-form rsmc">
        {/* Bill Type */}
        <label>
          Bill Type
          <select
            name="BillType"
            value={form.BillType}
            onChange={handleChange}
            required
          >
            <option value="" disabled>— select type —</option>
            <option value="PROGRESS">PROGRESS</option>
            <option value="INTERIM">INTERIM</option>
          </select>
        </label>

        {/* Level */}
        <label>
          Level
          <select
            name="Level"
            value={form.Level}
            onChange={handleChange}
            required
          >
            <option value="" disabled>— select level —</option>
            <option value="JOB">JOB</option>
            <option value="SERV">SERV(S)</option>
          </select>
        </label>

        {/* Population */}
        {form.Level && (
          <label>
            Population
            <MultiSelect
              options={populationOptions}
              value={selectedOptions}
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
          <select
            name="Frequency"
            value={form.Frequency}
            onChange={handleChange}
            required
          >
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
          />
        </label>

        <div className="buttons">
          <button type="button" onClick={onRequestClose}>
            Cancel
          </button>
          <button type="submit">Save</button>
          {onDelete && (
            <button
              type="button"
              className="delete-button"
              onClick={() => onDelete(form.uuid)}
            >
              Delete
            </button>
          )}
        </div>
      </form>

      <ToastContainer position="top-right" autoClose={4000} />
    </Modal>
  );
}
