import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { inventorySyncAPI } from '../services/api';
import '../styles/AdminInventorySync.css';

const CLASSIFICATION_LABELS = {
  CREATE:           'CREATE',
  UPDATE:           'UPDATE',
  REVIEW:           'REVIEW',
  ERROR:            'ERROR',
  CREATE_CANDIDATE: 'CREATE',
};

const IMAGE_STATUS_LABELS = {
  matched:      { label: '✅ Matched',  cls: 'inv-img-matched'  },
  missing:      { label: '⚠ Missing',  cls: 'inv-img-missing'  },
  not_provided: { label: '—',           cls: 'inv-img-none'     },
};

const AdminInventorySync = () => {
  const { logout, isAdmin, loading: authLoading } = useAuth();
  const navigate            = useNavigate();
  const fileInputRef        = useRef(null);
  const zipInputRef         = useRef(null);

  const [selectedFile,   setSelectedFile]   = useState(null);
  const [selectedZip,    setSelectedZip]    = useState(null); // ZIP of images
  const [imageFilesStale, setImageFilesStale] = useState(false); // images changed after preview
  const [previewResult,  setPreviewResult]  = useState(null);
  const [applyResult,    setApplyResult]    = useState(null);
  const [applyErrorRows, setApplyErrorRows] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading,   setApplyLoading]   = useState(false);
  const [errorMessage,   setErrorMessage]   = useState('');

  useEffect(() => {
    if (!authLoading && !isAdmin()) navigate('/ckk-secure-admin');
  }, [authLoading, isAdmin, navigate]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewResult(null);
    setApplyResult(null);
    setApplyErrorRows([]);
    setErrorMessage('');
    setImageFilesStale(false);
  };

  const handleZipChange = (e) => {
    const file = e.target.files[0] || null;
    setSelectedZip(file);
    if (previewResult) setImageFilesStale(true); // image files changed after preview
    setApplyResult(null);
  };

  const getImageFiles = () => ({ zip: selectedZip || null, images: [] });

  const handlePreview = async () => {
    if (!selectedFile || previewLoading) return;
    setPreviewLoading(true);
    setErrorMessage('');
    setPreviewResult(null);
    setApplyResult(null);
    setApplyErrorRows([]);
    setImageFilesStale(false);
    try {
      const result = await inventorySyncAPI.preview(selectedFile, getImageFiles());
      setPreviewResult(result);
    } catch (err) {
      setErrorMessage(
        err.response?.data?.error || 'Preview failed — check the server or try again.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedFile || !previewResult || !canApply || applyLoading) return;
    if (imageFilesStale) {
      if (!window.confirm('Image files changed since last preview. Re-running preview with current files before applying is recommended. Apply anyway with the current files?')) return;
    }
    const confirmed = window.confirm(
      'This will create/update artwork records in the local database.\n\n' +
      'Imported new rows will be set to NEEDS_REVIEW and hidden from the public website.\n\n' +
      'Continue?'
    );
    if (!confirmed) return;
    setApplyLoading(true);
    setErrorMessage('');
    setApplyErrorRows([]);
    try {
      const result = await inventorySyncAPI.apply(selectedFile, getImageFiles());
      setApplyResult(result);
    } catch (err) {
      if (err.response?.status === 422) {
        const data = err.response.data;
        setErrorMessage(data?.error || 'Batch blocked — fix all errors before applying.');
        setApplyErrorRows(data?.errorRows || []);
      } else {
        setErrorMessage(
          err.response?.data?.error || 'Apply failed — transaction may have rolled back. No data was changed.'
        );
      }
    } finally {
      setApplyLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSelectedZip(null);
    setPreviewResult(null);
    setApplyResult(null);
    setApplyErrorRows([]);
    setErrorMessage('');
    setImageFilesStale(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (zipInputRef.current)  zipInputRef.current.value  = '';
  };

  const handleLogout = () => { logout(); navigate('/ckk-secure-admin'); };

  const canApply = previewResult && previewResult.summary.errorCount === 0 && !applyResult;
  const errorRows = previewResult?.rows?.filter(r => r.errors?.length > 0) || [];

  return (
    <div className="admin-inventory-sync">
      {/* Header */}
      <div className="admin-header">
        <h1>Inventory Sync</h1>
        <div className="admin-actions">
          <button onClick={() => navigate('/ckk-secure-admin/review-queue')} className="btn-secondary">
            Review Queue
          </button>
          <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="btn-secondary">
            ← Dashboard
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary">View Site</button>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      <div className="inv-content">

        {/* ── Upload section ─────────────────────────────────────────── */}
        <section className="inv-section inv-upload-section">
          <h2>Upload Inventory Workbook</h2>
          <p className="inv-helper">
            Upload the corrected Chitrakala inventory workbook. Preview must pass with zero
            errors before Apply is enabled.
          </p>

          {/* Workbook picker */}
          <div className="inv-file-area">
            <input
              ref={fileInputRef}
              id="inventory-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="inv-file-input"
            />
            <label htmlFor="inventory-file-input" className="inv-file-label">
              {selectedFile ? selectedFile.name : 'Choose .xlsx or .xls workbook…'}
            </label>
            {selectedFile && (
              <span className="inv-file-size">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>

          {/* Image ZIP picker */}
          <div className="inv-file-area" style={{ marginTop: '0.75rem' }}>
            <input
              ref={zipInputRef}
              id="inventory-zip-input"
              type="file"
              accept=".zip"
              onChange={handleZipChange}
              className="inv-file-input"
            />
            <label htmlFor="inventory-zip-input" className="inv-file-label inv-file-label-zip">
              {selectedZip ? selectedZip.name : 'Optional: choose .zip of artwork images…'}
            </label>
            {selectedZip && (
              <span className="inv-file-size">
                {(selectedZip.size / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
          </div>
          {selectedZip && (
            <p className="inv-zip-note">
              Images in the ZIP will be matched to workbook rows by <em>Image File Name</em> column.
              Accepted image types: .jpg, .jpeg, .png, .webp
            </p>
          )}

          {imageFilesStale && (
            <div className="inv-stale-warning">
              ⚠ Image files changed since last preview. Re-run Preview to refresh image match results.
            </div>
          )}

          <div className="inv-action-row">
            <button
              className="btn-primary"
              onClick={handlePreview}
              disabled={!selectedFile || previewLoading}
            >
              {previewLoading ? 'Previewing…' : 'Preview Inventory'}
            </button>

            {previewResult && (
              <button
                className={`btn-primary btn-apply${canApply ? '' : ' btn-disabled'}`}
                onClick={handleApply}
                disabled={!canApply || applyLoading}
                title={!canApply && previewResult?.summary.errorCount > 0
                  ? 'Fix workbook errors before applying'
                  : applyResult ? 'Already applied' : ''}
              >
                {applyLoading ? 'Applying…' : 'Apply Inventory Import'}
              </button>
            )}

            {(selectedFile || previewResult) && (
              <button className="btn-secondary" onClick={handleReset}>
                Clear / Upload Another File
              </button>
            )}
          </div>

          {errorMessage && (
            <div className="inv-error-banner">
              <strong>⚠ Error:</strong> {errorMessage}
              {applyErrorRows.length > 0 && (
                <ul className="inv-error-list">
                  {applyErrorRows.map((r, i) => (
                    <li key={i}>Row {r.rowNumber}: {r.errors.join('; ')}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Preview results ────────────────────────────────────────── */}
        {previewResult && (
          <section className="inv-section inv-preview-section">
            <h2>Preview Results</h2>

            {/* Row summary cards */}
            <div className="inv-summary-cards">
              <div className="inv-card inv-card-total">
                <span className="inv-card-num">{previewResult.summary.totalRows}</span>
                <span className="inv-card-label">Total Rows</span>
              </div>
              <div className="inv-card inv-card-create">
                <span className="inv-card-num">{previewResult.summary.createCount}</span>
                <span className="inv-card-label">Creates</span>
              </div>
              <div className="inv-card inv-card-update">
                <span className="inv-card-num">{previewResult.summary.updateCount}</span>
                <span className="inv-card-label">Updates</span>
              </div>
              <div className="inv-card inv-card-review">
                <span className="inv-card-num">{previewResult.summary.reviewCount}</span>
                <span className="inv-card-label">Reviews</span>
              </div>
              <div className="inv-card inv-card-error">
                <span className="inv-card-num">{previewResult.summary.errorCount}</span>
                <span className="inv-card-label">Errors</span>
              </div>
            </div>

            {/* Image summary cards */}
            {previewResult.imageSummary && (
              <div className="inv-image-summary">
                <h3 className="inv-table-heading">Image Match Summary</h3>
                <div className="inv-summary-cards inv-img-cards">
                  <div className="inv-card inv-card-img-total">
                    <span className="inv-card-num">{previewResult.imageSummary.rowsWithImageFilename}</span>
                    <span className="inv-card-label">Rows With Image</span>
                  </div>
                  <div className="inv-card inv-card-create">
                    <span className="inv-card-num">{previewResult.imageSummary.matched}</span>
                    <span className="inv-card-label">Matched</span>
                  </div>
                  <div className="inv-card inv-card-error">
                    <span className="inv-card-num">{previewResult.imageSummary.missing}</span>
                    <span className="inv-card-label">Missing</span>
                  </div>
                  <div className="inv-card inv-card-total">
                    <span className="inv-card-num">{previewResult.imageSummary.notProvided}</span>
                    <span className="inv-card-label">No Image</span>
                  </div>
                  {previewResult.imageSummary.unreferencedUploaded > 0 && (
                    <div className="inv-card inv-card-review">
                      <span className="inv-card-num">{previewResult.imageSummary.unreferencedUploaded}</span>
                      <span className="inv-card-label">Unreferenced</span>
                    </div>
                  )}
                </div>
                {previewResult.imageSummary.missing > 0 && previewResult.summary.errorCount === 0 && (
                  <p className="inv-img-missing-note">
                    ℹ️ Rows with missing images will still import as NEEDS_REVIEW — you can add images
                    later via the Review Queue.
                  </p>
                )}
              </div>
            )}

            {/* Blocking error banner */}
            {previewResult.summary.errorCount > 0 && (
              <div className="inv-blocking-banner">
                ⛔ Fix workbook errors before applying. The Apply button is disabled until all
                errors are resolved.
              </div>
            )}

            {/* Review rows notice */}
            {previewResult.summary.reviewCount > 0 &&
              previewResult.summary.errorCount === 0 && (
              <div className="inv-review-notice">
                ℹ️ Rows with warnings will import as{' '}
                <strong>NEEDS_REVIEW</strong> and will not appear publicly until approved.
              </div>
            )}

            {/* Batch warnings from server */}
            {previewResult.warnings?.length > 0 && (
              <div className="inv-batch-warnings">
                <strong>Server notices:</strong>
                {previewResult.warnings.map((w, i) => (
                  <p key={i} className="inv-batch-warning-msg">{w}</p>
                ))}
              </div>
            )}

            {/* Row table */}
            <h3 className="inv-table-heading">Row Details</h3>
            <div className="inv-table-wrap">
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Action</th>
                    <th>SKU</th>
                    <th>Item Description</th>
                    <th>Art Work</th>
                    <th>Size</th>
                    <th>Qty</th>
                    <th>Price (INR)</th>
                    <th>Image</th>
                    <th>Planned Status</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.rows.map((row) => {
                    const imgInfo = IMAGE_STATUS_LABELS[row.imageStatus] || IMAGE_STATUS_LABELS.not_provided;
                    return (
                      <tr
                        key={row.rowNumber}
                        className={`inv-row inv-row-${(row.classification || 'unknown').toLowerCase()}`}
                      >
                        <td className="inv-td-center">{row.rowNumber}</td>
                        <td>
                          <span className={`inv-badge inv-badge-${(row.classification || 'unknown').toLowerCase()}`}>
                            {CLASSIFICATION_LABELS[row.classification] || row.classification}
                          </span>
                        </td>
                        <td className="inv-td-sku">
                          {row.sku || '—'}
                          {row.skuGenerated && <span className="inv-generated"> auto</span>}
                        </td>
                        <td>{row.itemDescription || '—'}</td>
                        <td className="inv-td-center">{row.artWorkCode || '—'}</td>
                        <td className="inv-td-center">{row.sizeCode || '—'}</td>
                        <td className="inv-td-center">{row.quantity ?? '—'}</td>
                        <td className="inv-td-right">
                          {row.priceInr != null
                            ? `₹${row.priceInr.toLocaleString('en-IN')}`
                            : '—'}
                        </td>
                        <td>
                          <span className={imgInfo.cls} title={row.imageFilename || ''}>
                            {imgInfo.label}
                            {row.imageFilename && row.imageStatus !== 'not_provided' && (
                              <span className="inv-img-filename"> {row.imageFilename}</span>
                            )}
                          </span>
                        </td>
                        <td>
                          {row.plannedStatus ? (
                            <span className="inv-badge inv-badge-needs-review">
                              {row.plannedStatus}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="inv-td-issues">
                          {row.errors?.map((e, i) => (
                            <div key={`e${i}`} className="inv-issue inv-issue-error">✕ {e}</div>
                          ))}
                          {row.warnings?.map((w, i) => (
                            <div key={`w${i}`} className="inv-issue inv-issue-warn">⚠ {w}</div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Error summary list */}
            {errorRows.length > 0 && (
              <div className="inv-error-summary">
                <h4>⛔ Error Rows ({errorRows.length})</h4>
                <p>Fix these in the workbook before re-uploading:</p>
                <ul>
                  {errorRows.map((r) => (
                    <li key={r.rowNumber}>
                      <strong>Row {r.rowNumber}</strong>
                      {r.itemDescription && ` — "${r.itemDescription}"`}:&nbsp;
                      {r.errors.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ── Apply result ───────────────────────────────────────────── */}
        {applyResult && (
          <section className="inv-section inv-apply-section">
            <h2>✅ Import Complete</h2>
            <div className="inv-apply-summary">
              <div className="inv-apply-stat">
                <span className="inv-apply-num">{applyResult.summary.createdCount}</span>
                <span className="inv-apply-lbl">Artworks Created</span>
              </div>
              <div className="inv-apply-stat">
                <span className="inv-apply-num">{applyResult.summary.updatedCount}</span>
                <span className="inv-apply-lbl">Artworks Updated</span>
              </div>
              {applyResult.summary.imagesStored > 0 && (
                <div className="inv-apply-stat">
                  <span className="inv-apply-num">{applyResult.summary.imagesStored}</span>
                  <span className="inv-apply-lbl">Images Stored</span>
                </div>
              )}
            </div>

            {applyResult.created?.length > 0 && (
              <div className="inv-apply-list">
                <h4>Created ({applyResult.created.length})</h4>
                <ul>
                  {applyResult.created.slice(0, 8).map((r, i) => (
                    <li key={i}>
                      Row {r.rowNumber}: <code>{r.sku}</code> → <code>{r.artworkId}</code>
                      {r.title && <span className="inv-apply-title"> — {r.title}</span>}
                    </li>
                  ))}
                  {applyResult.created.length > 8 && (
                    <li className="inv-apply-more">…and {applyResult.created.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}

            {applyResult.updated?.length > 0 && (
              <div className="inv-apply-list">
                <h4>Updated ({applyResult.updated.length})</h4>
                <ul>
                  {applyResult.updated.slice(0, 4).map((r, i) => (
                    <li key={i}>
                      Row {r.rowNumber}: <code>{r.sku}</code>
                      {r.title && <span className="inv-apply-title"> — {r.title}</span>}
                    </li>
                  ))}
                  {applyResult.updated.length > 4 && (
                    <li className="inv-apply-more">…and {applyResult.updated.length - 4} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="inv-visibility-reminder">
              🔒 <strong>Public site only displays IN_STOCK artworks.</strong> Imported
              NEEDS_REVIEW rows remain hidden until reviewed and approved by an admin.
            </div>
          </section>
        )}

      </div>
    </div>
  );
};

export default AdminInventorySync;
