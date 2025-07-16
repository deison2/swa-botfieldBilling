// src/components/EditNarrativeModal.js
import { useState, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import { MultiSelect } from 'react-multi-select-component';
import './EditNarrativeModal.css';
import services from '../data/services.json';
//import 'react-multi-select-component/dist/default.css';


Modal.setAppElement('#root');

export default function EditNarrativeModal({
  isOpen,
  onRequestClose,
  initialData,
  onSave,
  onDelete,
  availableJobs // array of { Idx: number, JobName: string }
}) {
  // 1) Form state
  const [form, setForm] = useState({
    uuid: '',
    Idx: [],        // persisted values
    JobName: [],    // labels for display
    Level: '',
    Type: '',
    Serv: '',
    Narrative: '',
    isDefault: false
  });

  const [selectedOptions, setSelectedOptions] = useState([]);

  // 2) Build options for MultiSelect
  const jobOptions = useMemo(
    () =>
      availableJobs.map(job => ({
        label: job.JobName,
        value: job.Idx
      })),
    [availableJobs]
  );

  const sortedJobOptions = useMemo(() => {
    const selectedValues = new Set(selectedOptions.map(o => o.value))
    // clone so we don’t disturb the original
    return jobOptions
      .slice()
      .sort((a, b) => {
        const aSel = selectedValues.has(a.value)
        const bSel = selectedValues.has(b.value)
        // selected first
        if (aSel && !bSel) return -1
        if (!aSel && bSel) return 1
        // otherwise alphabetical
        return a.label.localeCompare(b.label)
      })
  }, [jobOptions, selectedOptions])

  // 3) Seed the form when modal opens
  useEffect(() => {
    if (!initialData) return;
    const selected = jobOptions.filter(opt =>
      initialData.Idx?.includes(opt.value)
    );

  console.log('Modal opened, initial selected IDX:', selected.map(o => o.value));
  console.log('Modal opened, initial selectedOptions:', selected);

    setSelectedOptions(selected);
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

  // 4) Handlers
  function handleJobChange(selected) {
    setSelectedOptions(selected);
    setForm(f => ({
      ...f,
      Idx: selected.map(o => o.value),
      JobName: selected.map(o => o.label)
    }));
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(f => ({
      ...f,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, uuid: form.uuid });
    onRequestClose();
  }

  function handleDeleteClick() {
    onDelete(form.uuid);
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel="Edit Narrative"
      overlayClassName="overlay"
      className="modal"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <h2>Edit Narrative</h2>
      <form onSubmit={handleSubmit} className="edit-form">
        {/* MultiSelect for JobName */}
        <label>
          Job(s)
          <MultiSelect
            ClearSelectedIcon={null}
            options={sortedJobOptions}
            value={selectedOptions}
            onChange={handleJobChange}
            labelledBy="Select jobs"
            hasSelectAll={false}
          />
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
           <option value="" disabled>— select type —</option>
           <option value="ALL">ALL</option>
           <option value="JOB">JOB</option>
           <option value="SERV">SERV</option>
         </select>
       </label>

        {/* Type */}
        <label>
         Type
         <select
           name="Type"
           value={form.Type}
           onChange={handleChange}
           required
         >
           <option value="" disabled>— select type —</option>
           <option value="ALL">ALL</option>
           <option value="DISB">DISB</option>
           <option value="TIME">TIME</option>
         </select>
       </label>

        {/* Service */}
        <label>
  Service
  <select
    name="Serv"
    value={form.Serv}
    onChange={handleChange}
    required
  >
    <option value="" disabled>
      — select service —
    </option>
    {services.map(serviceName => (
      <option key={serviceName} value={serviceName}>
        {serviceName}
      </option>
    ))}
  </select>
</label>


        {/* Narrative */}
        <label>
          Narrative
          <textarea
            name="Narrative"
            value={form.Narrative}
            onChange={handleChange}
          />
        </label>

        {/* Default? */}
        <label>
          Default?
          <input
            type="checkbox"
            name="isDefault"
            checked={form.isDefault}
            disabled
          />
        </label>

        {/* Actions */}
        <div className="buttons">
          <button type="button" onClick={onRequestClose}>
            Cancel
          </button>
          <button
            type="button"
            className="delete-button"
            onClick={handleDeleteClick}
          >
            Delete
          </button>
          <button type="submit">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}