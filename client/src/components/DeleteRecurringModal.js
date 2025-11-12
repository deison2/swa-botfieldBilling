// src/components/DeleteRecurringModal.js
import React from "react";
import Modal from "react-modal";

Modal.setAppElement("#root");

export default function DeleteRecurringModal({
  isOpen,
  onRequestClose,
  record,
  onConfirmDelete,
  jobLookup
}) {
  if (!record) return null;
  console.log(record);

  const { uuid, Level, Population, BillType, Frequency, Narrative, BillAmount } = record;

  // Display friendly labels for populations depending on Level
  const populationLines =
  Level && Array.isArray(Population)
    ? Population.map((p) => {
        if (Level === "JOB") {
          return jobLookup?.[p] || `#${p}`; // show name or fallback
        }
        return p; // for SERV, show raw string
      })
    : [];


  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      overlayClassName="overlay"
      className="modal"
      contentLabel="Confirm Delete"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
    >
      <h2>Delete Recurring Job?</h2>

      <p>This will permanently delete the following recurring job configuration:</p>

      <div className="job-summary">
        <p><strong>Bill Type:</strong> {BillType || "—"}</p>
        <p><strong>Level:</strong> {Level || "—"}</p>
        <p><strong>Frequency:</strong> {Frequency || "—"}</p>
        <p><strong>Bill Amount:</strong> {BillAmount ? `$${BillAmount}` : "—"}</p>
        <p><strong>Narrative:</strong></p>
        <blockquote>{Narrative || "—"}</blockquote>
      </div>

      {populationLines.length > 0 && (
        <>
          <p>
            {Level === "JOB"
              ? "This configuration applies to the following job(s):"
              : "This configuration applies to the following service(s):"}
          </p>
          <ul>
            {populationLines.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      )}

      <div className="buttons">
        <button onClick={onRequestClose}>Cancel</button>
        <button
          onClick={() => onConfirmDelete(uuid)}
          className="delete-button"
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
