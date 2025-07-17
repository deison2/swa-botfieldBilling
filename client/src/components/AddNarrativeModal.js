import { useState, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import { MultiSelect } from 'react-multi-select-component';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './EditNarrativeModal.css';
import services from '../data/services.json';

export default function AddNarrativeModal({
  isOpen,
  onRequestClose,
  onSave,
  availableJobs
}) {
  // form state
  const [form, setForm] = useState({
    Narrative: '',
    Level: 'ALL',
    Type: '',
    Serv: '',
    Idx: [],
    JobName: []
  });

  // select options
  const serviceOptions = useMemo(
    () => services.map(s => ({ value: s.code, label: s.name })),
    []
  );
  const jobOptions = useMemo(
    () =>
      availableJobs.map(({ Idx, JobName }) => ({
        value: Idx,
        label: JobName
      })),
    [availableJobs]
  );

  // reset form & toasts when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm({
        Narrative: '',
        Level: '',
        Type: '',
        Serv: '',
        Idx: [],
        JobName: []
      });
      toast.dismiss();
    }
  }, [isOpen]);

  // handle simple input/select changes
  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({
      ...f,
      [name]: value
    }));
    if (name === 'Level' && value !== 'JOB') {
      setForm(f => ({ ...f, Idx: [], JobName: [] }));
    }
  };

  // level=SERV -> service select
  const handleServiceChange = e => {
    setForm(f => ({ ...f, Serv: e.target.value }));
  };

  // level=JOB -> job multi-select
  const handleJobChange = selected => {
    if (form.Level !== 'JOB') return;
    setForm(f => ({
      ...f,
      Idx: selected.map(o => o.value),
      JobName: selected.map(o => o.label)
    }));
  };

  // simple validation with toast notifications
  const validate = () => {
    let valid = true;
    if (!form.Narrative.trim()) {
      toast.error('Narrative is required');
      valid = false;
    }
    if (!form.Type.trim()) {
      toast.error('Type is required');
      valid = false;
    }
    if (form.Level === 'SERV' && !form.Serv) {
      toast.error('Service is required');
      valid = false;
    }
    if (form.Level === 'JOB' && form.Idx.length === 0) {
      toast.error('At least one Job must be selected');
      valid = false;
    }
    return valid;
  };

  // submit handler
  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    await onSave(form);
    onRequestClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      ariaHideApp={false}
      className="modal"
      overlayClassName="overlay"
    >
      <ToastContainer position="top-right" autoClose={3000} />

      <form className="edit-form" onSubmit={handleSubmit}>
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
            {services.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {form.Level === 'SERV' && (
          <label>
            Service
            <select name="Serv" value={form.Serv} onChange={handleServiceChange}>
              <option value="">Select a service</option>
              {serviceOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        )}

        {form.Level === 'JOB' && form.Serv !== '' && (
          <label>
            Job Name(s)
            <MultiSelect
              options={jobOptions}
              value={jobOptions.filter(opt => form.Idx.includes(opt.value))}
              onChange={handleJobChange}
              labelledBy="Select Jobs"
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
          <input
            name="Narrative"
            value={form.Narrative}
            onChange={handleChange}
          />
        </label>

        <div className="buttons">
          <button type="button" onClick={onRequestClose}>Cancel</button>
          <button type="submit">Save</button>
        </div>
      </form>
    </Modal>
  );
}
