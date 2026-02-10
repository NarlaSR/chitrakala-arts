import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aboutAPI } from '../services/api';
import '../styles/AdminAbout.css';

const AdminAboutPage = () => {
  const navigate = useNavigate();
  const [aboutData, setAboutData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    loadAboutData();
  }, []);

  const loadAboutData = async () => {
    try {
      const data = await aboutAPI.get();
      setAboutData(data);
      setImagePreview(data.story.image);
    } catch (error) {
      console.error('Failed to load about page:', error);
      alert('Failed to load about page content');
    } finally {
      setLoading(false);
    }
  };

  const handleStoryChange = (field, value, index = null) => {
    setAboutData(prev => {
      if (index !== null) {
        const newParagraphs = [...prev.story.paragraphs];
        newParagraphs[index] = value;
        return {
          ...prev,
          story: { ...prev.story, paragraphs: newParagraphs }
        };
      }
      return {
        ...prev,
        story: { ...prev.story, [field]: value }
      };
    });
  };

  const addParagraph = () => {
    setAboutData(prev => ({
      ...prev,
      story: {
        ...prev.story,
        paragraphs: [...prev.story.paragraphs, '']
      }
    }));
  };

  const removeParagraph = (index) => {
    if (aboutData.story.paragraphs.length <= 1) {
      alert('Must have at least one paragraph');
      return;
    }
    setAboutData(prev => ({
      ...prev,
      story: {
        ...prev.story,
        paragraphs: prev.story.paragraphs.filter((_, i) => i !== index)
      }
    }));
  };

  const handleArtFormChange = (index, field, value) => {
    setAboutData(prev => {
      const newArtForms = [...prev.artForms];
      newArtForms[index] = { ...newArtForms[index], [field]: value };
      return { ...prev, artForms: newArtForms };
    });
  };

  const addArtForm = () => {
    setAboutData(prev => ({
      ...prev,
      artForms: [
        ...prev.artForms,
        { id: `art-form-${Date.now()}`, title: '', description: '' }
      ]
    }));
  };

  const removeArtForm = (index) => {
    if (aboutData.artForms.length <= 1) {
      alert('Must have at least one art form');
      return;
    }
    setAboutData(prev => ({
      ...prev,
      artForms: prev.artForms.filter((_, i) => i !== index)
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      let updatedData = { ...aboutData };

      // Upload image if changed
      if (imageFile) {
        const result = await aboutAPI.uploadImage(imageFile);
        updatedData.story.image = result.imageUrl;
      }

      // Save all data
      await aboutAPI.update(updatedData);
      alert('About page updated successfully!');
      setImageFile(null);
      loadAboutData();
    } catch (error) {
      console.error('Failed to update about page:', error);
      alert('Failed to update about page');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="admin-about"><div className="loading">Loading...</div></div>;
  }

  if (!aboutData) {
    return <div className="admin-about"><p>Failed to load about page content</p></div>;
  }

  return (
    <div className="admin-about">
      <div className="admin-about-header">
        <button onClick={() => navigate('/ckk-secure-admin/dashboard')} className="back-button">
          ← Back to Dashboard
        </button>
        <h2>Edit About Page</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="about-form">
        {/* Our Story Section */}
        <div className="form-section">
          <h3>Our Story</h3>
          
          <div className="form-group">
            <label>Section Title</label>
            <input
              type="text"
              value={aboutData.story.title}
              onChange={(e) => handleStoryChange('title', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Story Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Story preview" />
              </div>
            )}
          </div>

          <label>Paragraphs</label>
          {aboutData.story.paragraphs.map((paragraph, index) => (
            <div key={index} className="paragraph-group">
              <textarea
                value={paragraph}
                onChange={(e) => handleStoryChange('paragraphs', e.target.value, index)}
                rows="3"
                required
              />
              {aboutData.story.paragraphs.length > 1 && (
                <button type="button" onClick={() => removeParagraph(index)} className="btn-remove">
                  Remove Paragraph
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addParagraph} className="btn-add">
            + Add Paragraph
          </button>
        </div>

        {/* Art Forms Section */}
        <div className="form-section">
          <h3>Art Forms</h3>
          
          {aboutData.artForms.map((artForm, index) => (
            <div key={artForm.id} className="art-form-group">
              <div className="form-group">
                <label>Art Form Title</label>
                <input
                  type="text"
                  value={artForm.title}
                  onChange={(e) => handleArtFormChange(index, 'title', e.target.value)}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={artForm.description}
                  onChange={(e) => handleArtFormChange(index, 'description', e.target.value)}
                  rows="4"
                  required
                />
              </div>
              
              {aboutData.artForms.length > 1 && (
                <button type="button" onClick={() => removeArtForm(index)} className="btn-remove">
                  Remove Art Form
                </button>
              )}
            </div>
          ))}
          
          <button type="button" onClick={addArtForm} className="btn-add">
            + Add Art Form
          </button>
        </div>

        {/* Process Section */}
        <div className="form-section">
          <h3>Our Process</h3>
          
          <div className="form-group">
            <label>Section Title</label>
            <input
              type="text"
              value={aboutData.process.title}
              onChange={(e) => setAboutData(prev => ({
                ...prev,
                process: { ...prev.process, title: e.target.value }
              }))}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={aboutData.process.text}
              onChange={(e) => setAboutData(prev => ({
                ...prev,
                process: { ...prev.process, text: e.target.value }
              }))}
              rows="4"
              required
            />
          </div>
        </div>

        {/* Commitment Section */}
        <div className="form-section">
          <h3>Our Commitment</h3>
          
          <div className="form-group">
            <label>Section Title</label>
            <input
              type="text"
              value={aboutData.commitment.title}
              onChange={(e) => setAboutData(prev => ({
                ...prev,
                commitment: { ...prev.commitment, title: e.target.value }
              }))}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={aboutData.commitment.text}
              onChange={(e) => setAboutData(prev => ({
                ...prev,
                commitment: { ...prev.commitment, text: e.target.value }
              }))}
              rows="4"
              required
            />
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="button" 
            onClick={() => navigate('/ckk-secure-admin/dashboard')} 
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminAboutPage;
