// src/components/EditNarrativeModal.js
import { useState, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import { MultiSelect } from 'react-multi-select-component';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './EditNarrativeModal.css';
// import { dataType } from '../config.js'; // import dataType from config
import services from '../devSampleData/services.json';

import {
  loadServiceMapping
} from '../services/NarrativeService.js';

// Dynamically load service mapping based on environment

const servData = await loadServiceMapping()
  .catch(err => {
    console.error(err);
    return services;
  });

const servMapping = servData.map(item => item.SERVINDEX);
console.log(servMapping);

Modal.setAppElement('#root');

export default function EditNarrativeModal({
  isOpen,
  onRequestClose,
  initialData,
  onSave,
  onDelete,
  availableJobs, // array of { Idx: number, JobName: string, Serv: string }
  allNarratives, // array of all narratives for validation
}) {
  // Form state
  const [form, setForm] = useState({
    uuid: '',
    Idx: [],
    JobName: [],
    Level: '',
    Type: '',
    Serv: '',
    Narrative: ''
  });
  const [selectedOptions, setSelectedOptions] = useState([]);

    // ➊ compute the set of job-Idx already used by other narratives
  const usedJobIdx = useMemo(() => {
    if (!allNarratives) return new Set();
    return new Set(
      allNarratives
        .filter(r => r.uuid !== initialData?.uuid && r.Level === 'JOB')
        .flatMap(r => r.Idx || [])
    );
  }, [allNarratives, initialData]);

  // Build raw options including service
  const jobOptions = useMemo(
    () =>
      availableJobs.map(job => ({
        label: `${job.JobName} (${job.Serv})`,
        value: job.Idx,
        serv: job.Serv
      })),
    [availableJobs]
  );

  // Sort, selected first
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

  const filteredJobOptions = useMemo(() => {
    let opts = sortedJobOptions;

    // keep only same-service if SERVICE filter applies
    if (form.Serv && form.Serv !== 'ALL') {
      const base = opts.filter(opt => opt.serv === form.Serv);
      const missing = selectedOptions.filter(
        sel => !base.some(opt => opt.value === sel.value)
      );
      opts = [...base, ...missing];
    }

    // ➌ now drop any option that’s already used *elsewhere*, unless it’s on THIS row
    return opts.filter(opt => {
      const isSelectedHere = selectedOptions.some(o => o.value === opt.value);
      return isSelectedHere || !usedJobIdx.has(opt.value);
    });
  }, [sortedJobOptions, form.Serv, selectedOptions, usedJobIdx]);

  // Seed form when modal opens
  useEffect(() => {
    if (!initialData) return;
    // Match both Idx and Serv to find the correct single options
    const selected = jobOptions.filter(
      opt =>
        initialData.Idx?.includes(opt.value) &&
        opt.serv === initialData.Serv
    );
    setSelectedOptions(selected);
    console.log(selected);
    setForm({
      uuid: initialData.uuid,
      Idx: selected.map(o => o.value),
      JobName: selected.map(o => o.label),
      Level: initialData.Level || '',
      Type: initialData.Type || '',
      Serv: initialData.Serv || '',
      Narrative: initialData.Narrative || '',
      isDefault: initialData.isDefault || false
    });
  }, [initialData, jobOptions]);

  // Handle job selection
  function handleJobChange(selected) {
    if (form.Level !== 'JOB') return;
    if (form.Serv !== 'ALL') {
      const invalid = selected.find(opt => opt.serv !== form.Serv);
      if (invalid) {
        toast.error(
          `Cannot add "${invalid.label}" — service "${invalid.serv}" does not match "${form.Serv}"`
        );
        return;
      }
    }
    setSelectedOptions(selected);
    setForm(f => ({
      ...f,
      Idx: selected.map(o => o.value),
      JobName: selected.map(o => o.label)
    }));
  }

  // Handle input changes
function handleChange(e) {
  const { name, value, type, checked } = e.target;

  console.log(e.target); //Debugging line to check the event target
  
  setForm(prev => {
    // start by applying whatever field just changed
    const next = {
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    };

    console.log(next);
    // if they just changed the service, and it’s different than before…
    if (prev.Serv !== next.Serv || next.Level !== 'JOB') {
    console.log("Change in serv or level != job, wiping selections");
      next.Idx = [];
      next.JobName = [];
    handleJobChange([]);
    }

    return next;
  });
}


  // Submit form
  function handleSubmit(e) {
    e.preventDefault();
    const data = { ...form };
    if (data.Level !== 'JOB') {
      data.Idx = [];
      data.JobName = [];
    }
    onSave(data);
    onRequestClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName="overlay"
      className="modal"
      contentLabel="Edit Narrative"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <h2>Edit Narrative</h2>
      <form onSubmit={handleSubmit} className="edit-form rsmc">
        <label>
          Level
          <select name="Level" value={form.Level} onChange={handleChange} required>
            <option value="" disabled>
              — select level —
            </option>
            <option value="ALL">ALL</option>
            <option value="JOB">JOB</option>
            <option value="SERV">SERV</option>
          </select>
        </label>

        <label>
          Service
          <select name="Serv" value={form.Serv} onChange={handleChange} required>
            <option value="" disabled>
              — select service —
            </option>
            {servMapping.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {form.Level === 'JOB' && ( //Only populate if Level is JOB
        <label>
          Job(s)
          <MultiSelect
            options={filteredJobOptions}
            value={selectedOptions}
            onChange={handleJobChange}
            labelledBy="Select jobs"
            hasSelectAll={false}
            ClearSelectedIcon={null} //Hides 'x' token
          />
        </label>
        )}

        <label>
          Type
          <select name="Type" value={form.Type} onChange={handleChange} required>
            <option value="" disabled>
              — select type —
            </option>
            <option value="ALL">ALL</option>
            <option value="DISB">DISB</option>
            <option value="TIME">TIME</option>
          </select>
        </label>

        <label>
          Narrative
          <textarea name="Narrative" 
          value={form.Narrative} 
          onChange={handleChange} />
        </label>

        <div className="buttons">
          <button type="button" onClick={onRequestClose}>Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
      <ToastContainer position="top-right" autoClose={5000} />
    </Modal>
  );
}
