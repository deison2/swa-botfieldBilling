// src/components/DataTable.js
import DataTableComponent from 'react-data-table-component';
import './DataTable.css';

export default function DataTable({
  title,
  columns,
  data,
  progressPending,
  pagination,
  highlightOnHover,
  striped,
  onRowAdd,
  onRowUpdate,
  onRowDelete,
  onRowClicked,
  conditionalRowStyles,
  ...rest
}) {
  return (
    <div className="data-table-container">
    <DataTableComponent
      className={'data-table'}
      title={title}
      columns={columns}
      data={data}
      progressPending={progressPending}
      pagination={pagination}
      highlightOnHover={highlightOnHover}
      striped={striped}
      // if you wired add/update/delete via props:
      onRowAdd={onRowAdd}
      onRowUpdate={onRowUpdate}
      onRowDelete={onRowDelete}
      onRowClicked={onRowClicked}
      conditionalRowStyles={conditionalRowStyles}
      fixedHeader
      fixedHeaderScrollHeight="100%"
      {...rest}
    />
    </div>
  );
}
