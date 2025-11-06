// src/components/EditRecurringModal.js
import { useState, useEffect, useMemo } from "react";
import Modal from "react-modal";
import { MultiSelect } from "react-multi-select-component";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./EditNarrativeModal.css";

import { loadJobMapping } from "../services/RecurringService.js";

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
  const [selectedOptions, setSelectedOptions] = useState([]);

 useEffect(() => {
  if (!isOpen) return; // only run when modal is open

  (async () => {
    try {
      const data = await loadJobMapping();

      // Choose sorting based on form level
      const sorted =
        form.Level === "Job"
          ? data.sort((a, b) => a.JobName.localeCompare(b.JobName))
          : data.sort((a, b) => a.Serv.localeCompare(b.Serv));

      const lookup = sorted.reduce((acc, { Idx, JobName }) => {
        acc[Idx] = JobName;
        return acc;
      }, {});

      setJobMappingData(sorted);
      setJobLookup(lookup);
    } catch (err) {
      console.error("Failed to load job mapping:", err);
    }
  })(); // run async IIFE only when modal opens
}, [isOpen, form.Level]);


  const jobOptions = useMemo(() => {
    return jobMappingData.map((j) => ({
      label: j.JobName,
      value: j.Idx,
      serv: j.Serv
    }));
  }, [jobMappingData]);

  // selected jobs first
  const sortedJobOptions = useMemo(() => {
    const sel = new Set(selectedOptions.map(o => o.value));
    return jobOptions.slice().sort((a, b) => {
      const aSel = sel.has(a.value);
      const bSel = sel.has(b.value);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [jobOptions, selectedOptions]);

useEffect(() => {
  if (isOpen && initialData && jobLookup && Object.keys(jobLookup).length) {
    const populationNames =
      initialData.Level === "Job"
        ? initialData.Population.map((idx) => jobLookup[idx] || idx)
        : initialData.Population;


    const selected = jobOptions.filter(opt =>
      populationNames.includes(opt.label)
    );

    setSelectedOptions(selected);
    setForm({
      ...initialData,
      Population: populationNames
    });
  }
  }, [initialData, jobLookup, jobOptions, isOpen]);




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
    setForm(prev => ({ ...prev, [name]: value }));
  }

  // Save changes
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
              options={sortedJobOptions}
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
            step="0.01"
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
