// src/components/AddNarrativeModal.js
import React, { useState, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import { MultiSelect } from 'react-multi-select-component';
import services from '../data/services.json';
import { toast, ToastContainer } from 'react-toastify';
import './EditNarrativeModal.css';

Modal.setAppElement('#root');

const initialFormState = {
  Level: '',
  Idx: [],
  JobName: [],
  Type: '',
  Serv: '',
  Narrative: '',
  isDefault: false
};

export default function AddNarrativeModal({
  isOpen,
  onRequestClose,
  onSave,
  availableJobs // array of { Idx: number, JobName: string, Serv: string }
}) {


  const [form, setForm] = useState(initialFormState);
  const [selectedOptions, setSelectedOptions] = useState([]);

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
    if (form.Serv === '' || form.Serv === 'ALL') return sortedJobOptions;
    const base = sortedJobOptions.filter(opt => opt.serv === form.Serv);
    const missing = selectedOptions.filter(sel => !base.some(opt => opt.value === sel.value));
    return [...base, ...missing];
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

    
    // 1️⃣ validate each field
    if (!form.Type) {
      toast.error('Please select a Type');
      return;
    }
    if (!form.Serv) {
      toast.error('Please select a Service');
      return;
    }
    // only require jobs if Level is JOB
    if (form.Idx.length === 0) {
      toast.error('Please select at least one Job');
      return;
    }
    if (!form.Narrative.trim()) {
      toast.error('Narrative cannot be empty');
      return;
    }

    // simple validation
    if (!form.Type || !form.Serv ||!form.Idx) return;
     
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
          <select name="Level" value={form.Level} defaultValue={'JOB'} onChange={handleChange}>
            <option value="JOB">JOB</option>
          </select>
        </label>

        <label>
          Service
          <select name="Serv" value={form.Serv} onChange={handleChange} required>
            <option value="" disabled>— select service —</option>
            {services.map(s => (
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
