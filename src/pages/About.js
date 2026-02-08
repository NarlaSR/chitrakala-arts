import React, { useState, useEffect } from 'react';
import { aboutAPI } from '../services/api';
import '../styles/About.css';

const About = () => {
  const [aboutData, setAboutData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAboutData = async () => {
      try {
        const data = await aboutAPI.get();
        setAboutData(data);
      } catch (error) {
        console.error('Failed to load about page:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAboutData();
  }, []);

  if (loading) {
    return (
      <div className="about-page">
        <div className="container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (!aboutData) {
    return (
      <div className="about-page">
        <div className="container">
          <p>Unable to load about page content.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="about-page">
      <div className="about-hero">
        <h1>About Chitrakala Arts</h1>
        <p>Where tradition meets contemporary artistry</p>
      </div>

      <div className="container">
        <section className="about-section">
          <h2>{aboutData.story.title}</h2>
          {aboutData.story.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {aboutData.story.image && (
            <div className="story-image">
              <img src={aboutData.story.image} alt="Our Story" />
            </div>
          )}
        </section>

        <section className="about-section">
          <h2>Our Art Forms</h2>
          
          {aboutData.artForms.map((artForm) => (
            <div className="art-form" key={artForm.id}>
              <h3>{artForm.title}</h3>
              <p>{artForm.description}</p>
            </div>
          ))}
        </section>

        <section className="about-section">
          <h2>{aboutData.process.title}</h2>
          <p>{aboutData.process.text}</p>
        </section>

        <section className="about-section">
          <h2>{aboutData.commitment.title}</h2>
          <p>{aboutData.commitment.text}</p>
        </section>
      </div>
    </div>
  );
};

export default About;
