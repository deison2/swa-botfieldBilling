// src/components/AddNarrativeModal.js
import React, { useState, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import { MultiSelect } from 'react-multi-select-component';
import services from '../data/services.json';
import { toast, ToastContainer } from 'react-toastify';
import './EditNarrativeModal.css';
import { dataType } from '../config.js'; // import dataType from config

import {
  loadServiceMapping
} from '../services/NarrativeService.js';

Modal.setAppElement('#root');

// Dynamically load service mapping based on environment
const servData = dataType === 'PROD' ? await loadServiceMapping() : services;
const servMapping = servData.map(item => item.SERVINDEX);

const initialFormState = {
  Level: 'JOB',
  Idx: [],
  JobName: [],
  Type: '',
  Serv: '',
  Narrative: ''
};

export default function AddNarrativeModal({
  isOpen,
  onRequestClose,
  onSave,
  availableJobs, // array of { Idx: number, JobName: string, Serv: string }
  allNarratives    // pass in `rows` from the parent
}) {


  const [form, setForm] = useState(initialFormState);
  const [selectedOptions, setSelectedOptions] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setForm(initialFormState);
      setSelectedOptions([]);
    }
  }, [isOpen]);

  // 3️⃣ Build job-options & filter logic (same as in edit modal)
  const jobOptions = useMemo(
    () =>
      availableJobs.map(job => ({
        label: `${job.JobName} (${job.Serv})`,
        value: job.Idx,
        serv: job.Serv
      })),
    [availableJobs]
  );

  const sortedJobOptions = useMemo(() => {
    const sel = new Set(selectedOptions.map(o => o.value));
    return jobOptions
      .slice()
      .sort((a, b) => (sel.has(a.value) && !sel.has(b.value) ? -1 : sel.has(b.value) && !sel.has(a.value) ? 1 : a.label.localeCompare(b.label)));
  }, [jobOptions, selectedOptions]);

  const filteredJobOptions = useMemo(() => {
    let opts = sortedJobOptions;

    // keep same-service (plus any already-selected)
    if (form.Serv && form.Serv !== 'ALL') {
      const base = opts.filter(opt => opt.serv === form.Serv);
      const missing = selectedOptions.filter(
        sel => !base.some(o => o.value === sel.value)
      );
      opts = [...base, ...missing];
    }

    // now exclude any job taken elsewhere
    return opts;
  }, [sortedJobOptions, form.Serv, selectedOptions]);

  // 4️⃣ Handlers
  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      // if service or level changed, wipe job selections
      if (name === 'Serv' && prev.Serv !== next.Serv) {
        next.Idx = [];
        next.JobName = [];
        setSelectedOptions([]);
      }
      return next;
    });
  }

  function handleJobChange(selected) {
    if (form.Serv !== 'ALL') {
      const invalid = selected.find(opt => opt.serv !== form.Serv);
      if (invalid) {
        return; // or toast an error
      }
    }
    setSelectedOptions(selected);
    setForm(f => ({
      ...f,
      Idx: selected.map(o => o.value),
      JobName: selected.map(o => o.label)
    }));
  }

  // 5️⃣ Submission: local + cloud
 async function handleSubmit(e) {
  e.preventDefault();

  // basic validations
  if (!form.Type) {
    toast.error('Please select a Type');
    return;
  }
  if (!form.Serv) {
    toast.error('Please select a Service');
    return;
  }
  if (form.Idx.length === 0) {
    toast.error('Please select at least one Job');
    return;
  }
  if (!form.Narrative.trim()) {
    toast.error('Narrative cannot be empty');
    return;
  }

  // find any existing narratives with same Service + Type + overlapping Job(s)
  const collisions = allNarratives.filter(n =>
    n.Serv === form.Serv &&
    n.Type === form.Type &&
    Array.isArray(n.Idx) &&
    n.Idx.some(idx => form.Idx.includes(idx))
  );

  if (collisions.length > 0) {
    // gather the specific job-Idxs that collide
    const collidedIdxs = Array.from(
      new Set(
        collisions.flatMap(n =>
          n.Idx.filter(idx => form.Idx.includes(idx))
        )
      )
    );

    // map those idxs back to the selectedOptions labels
    const collidedJobs = selectedOptions
      .filter(o => collidedIdxs.includes(o.value))
      .map(o => o.label);

    toast.error(
      `A narrative already exists for job${collidedJobs.length>1?'s':''} ${collidedJobs.join(', ')} ` +
      `with Service "${form.Serv}" and Type "${form.Type}".`
    );
    return;
  }

  // if we get here, no duplicates → save!
  onSave(form);
  onRequestClose();
}

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName="overlay"
      className="modal"
      contentLabel="Add Narrative"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <h2>Add Narrative</h2>
      <form onSubmit={handleSubmit} className="edit-form rsmc">
        <label>
  Level
  <select
    name="Level"
    value="JOB"
    onChange={() => {}}
    style={{
      pointerEvents: "none",     // user can’t click or focus
      backgroundColor: "#eee"   // visually “disabled”
    }}
  >
    <option value="JOB">JOB</option>
  </select>
</label>

        <label>
          Service
          <select name="Serv" value={form.Serv} onChange={handleChange} required>
            <option value="" disabled>— select service —</option>
            {servMapping.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {form.Serv !== '' && (
          <label>
            Job(s)
            <MultiSelect
              options={filteredJobOptions}
              value={selectedOptions}
              onChange={handleJobChange}
              labelledBy="Select jobs"
              hasSelectAll={false}
              ClearSelectedIcon={null}
            />
          </label>
        )}

        <label>
          Type
          <select name="Type" value={form.Type} onChange={handleChange} required>
            <option value="" disabled>— select type —</option>
            <option value="ALL">ALL</option>
            <option value="DISB">DISB</option>
            <option value="TIME">TIME</option>
          </select>
        </label>

        <label>
          Narrative
          <textarea name="Narrative" value={form.Narrative} onChange={handleChange} />
        </label>

        <div className="buttons">
          <button type="button" onClick={onRequestClose}>Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
      <ToastContainer position="top-right" autoClose={3000} />
    </Modal>
  );
}
