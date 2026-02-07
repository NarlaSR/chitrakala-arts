import React from 'react';
import '../styles/About.css';

const About = () => {
  return (
    <div className="about-page">
      <div className="about-hero">
        <h1>About Chitrakala Arts</h1>
        <p>Where tradition meets contemporary artistry</p>
      </div>

      <div className="container">
        <section className="about-section">
          <h2>Our Story</h2>
          <p>
            Chitrakala Arts was born from a passion for preserving and celebrating traditional 
            Indian art forms while adapting them for contemporary spaces. Each piece we create 
            is a labor of love, combining time-honored techniques with modern aesthetics.
          </p>
          <p>
            Our journey began with a simple vision: to bring the beauty of handcrafted art 
            into homes and hearts around the world. Today, we specialize in three distinct 
            art forms that showcase the rich cultural heritage of India.
          </p>
        </section>

        <section className="about-section">
          <h2>Our Art Forms</h2>
          
          <div className="art-form">
            <h3>Dot Mandala Art</h3>
            <p>
              Mandala art is an ancient practice of creating circular patterns that represent 
              wholeness and harmony. Our dot mandalas are meticulously crafted using thousands 
              of individually placed dots, creating mesmerizing patterns that draw the eye inward 
              and promote a sense of peace and balance.
            </p>
          </div>

          <div className="art-form">
            <h3>Lippan Art</h3>
            <p>
              Originating from the Kutch region of Gujarat, Lippan art is a traditional mural 
              craft that uses clay and mirrors to create stunning decorative pieces. Our Lippan 
              artworks preserve this centuries-old technique while incorporating contemporary 
              designs that complement modern interiors.
            </p>
          </div>

          <div className="art-form">
            <h3>Textile Designing</h3>
            <p>
              Our textile designs celebrate the rich tapestry of Indian patterns and motifs. 
              Each piece is hand-painted with careful attention to detail, blending traditional 
              textile traditions with contemporary color palettes and design sensibilities.
            </p>
          </div>
        </section>

        <section className="about-section">
          <h2>Our Process</h2>
          <p>
            Every artwork at Chitrakala Arts is handcrafted with dedication and precision. 
            We use high-quality materials and take pride in the meticulous attention to detail 
            that goes into each piece. From the initial concept to the final touches, our process 
            ensures that every artwork is unique and of the highest quality.
          </p>
        </section>

        <section className="about-section">
          <h2>Our Commitment</h2>
          <p>
            We are committed to preserving traditional art forms while making them accessible 
            and relevant for contemporary audiences. Each purchase supports the continuation 
            of these beautiful artistic traditions and helps us share them with the world.
          </p>
        </section>
      </div>
    </div>
  );
};

export default About;
