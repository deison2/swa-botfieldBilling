// src/components/DeleteNarrativeModal.js
import React from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root');

export default function DeleteNarrativeModal({
  isOpen,
  onRequestClose,
  narrative,       // the full row object
  jobLookup,       // parent’s map of Idx→JobName
  onConfirmDelete, // callback(uuid)
}) {
  if (!narrative) return null;

  // build strings like “JobName (Service)”
  const jobLines =
    narrative.Level === 'JOB'
      ? narrative.Idx.map(i => `${jobLookup[i] || `#${i}`} (${narrative.Serv})`)
      : [];

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName="overlay"
      className="modal"
      contentLabel="Confirm Delete"
    >
      <h2>Delete Narrative?</h2>
      <p>
        This will delete the following narrative:
        <blockquote>{narrative.Narrative}</blockquote>
      </p>

      {jobLines.length > 0 && (
        <>
          <p>It is currently applied to these job(s) (and their respectice service):</p>
          <ul>
            {jobLines.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}

      <div className="buttons">
        <button onClick={onRequestClose}>Cancel</button>
        <button
          onClick={() => onConfirmDelete(narrative.uuid)}
          className="delete-button"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
