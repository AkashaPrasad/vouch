"""Built-in job fields and preset roles for the preferences picker (GET /api/presets)."""

FIELDS: list[dict] = [
    {"key": "engineering", "label": "Engineering", "roles": [
        "Software Engineer", "SDE Intern", "Backend Engineer", "Frontend Engineer", "Full Stack Developer", "Mobile Developer",
        "Android Developer", "iOS Developer", "DevOps Engineer", "Site Reliability Engineer", "Cloud Engineer", "QA Engineer",
        "Security Engineer", "Embedded Engineer", "Platform Engineer", "Engineering Manager"]},
    {"key": "data_ai", "label": "Data & AI", "roles": [
        "Data Analyst", "Data Scientist", "Data Engineer", "Machine Learning Engineer", "AI Engineer", "ML Research Scientist",
        "Business Intelligence Analyst", "Analytics Engineer", "MLOps Engineer", "NLP Engineer", "Computer Vision Engineer",
        "Data Science Intern"]},
    {"key": "design", "label": "Design", "roles": [
        "Product Designer", "UX Designer", "UI Designer", "UX Researcher", "Visual Designer", "Graphic Designer",
        "Interaction Designer", "Motion Designer", "Design Intern", "Brand Designer"]},
    {"key": "product", "label": "Product", "roles": [
        "Product Manager", "Associate Product Manager", "Senior Product Manager", "Product Analyst", "Product Owner",
        "Technical Product Manager", "Growth Product Manager", "Product Management Intern", "Program Manager"]},
    {"key": "marketing", "label": "Marketing", "roles": [
        "Marketing Manager", "Digital Marketing Executive", "Growth Marketer", "Performance Marketing Manager", "SEO Specialist",
        "Social Media Manager", "Brand Manager", "Product Marketing Manager", "Content Marketing Manager", "Marketing Intern",
        "Marketing Analyst"]},
    {"key": "sales", "label": "Sales", "roles": [
        "Sales Executive", "Business Development Executive", "Account Executive", "Sales Development Representative",
        "Inside Sales Representative", "Key Account Manager", "Sales Manager", "Pre-Sales Consultant", "Business Development Intern",
        "Partnerships Manager"]},
    {"key": "finance", "label": "Finance", "roles": [
        "Financial Analyst", "Accountant", "Chartered Accountant", "Investment Analyst", "Finance Manager", "Credit Analyst",
        "Risk Analyst", "Auditor", "Tax Associate", "FP&A Analyst", "Finance Intern"]},
    {"key": "operations", "label": "Operations", "roles": [
        "Operations Executive", "Operations Manager", "Supply Chain Analyst", "Logistics Coordinator", "Business Operations Associate",
        "Procurement Specialist", "Project Coordinator", "Operations Analyst", "Strategy & Operations Associate", "Operations Intern"]},
    {"key": "hr", "label": "HR", "roles": [
        "HR Executive", "HR Generalist", "Talent Acquisition Specialist", "Technical Recruiter", "HR Business Partner",
        "People Operations Associate", "Learning & Development Specialist", "Compensation Analyst", "HR Intern"]},
    {"key": "legal", "label": "Legal", "roles": [
        "Legal Associate", "Corporate Lawyer", "Legal Counsel", "Compliance Officer", "Company Secretary", "Paralegal",
        "Contract Manager", "Legal Intern"]},
    {"key": "content", "label": "Content", "roles": [
        "Content Writer", "Copywriter", "Technical Writer", "Editor", "Content Strategist", "Video Editor", "Journalist",
        "Content Creator", "Content Intern"]},
    {"key": "customer_support", "label": "Customer Support", "roles": [
        "Customer Support Executive", "Customer Success Manager", "Technical Support Engineer", "Customer Service Representative",
        "Support Team Lead", "Client Relationship Manager", "Implementation Specialist", "Customer Experience Associate"]},
    {"key": "research", "label": "Research", "roles": [
        "Research Analyst", "Research Associate", "Research Scientist", "Market Research Analyst", "Policy Analyst",
        "Research Engineer", "Postdoctoral Researcher", "Research Intern", "Economist"]},
    {"key": "education", "label": "Education", "roles": [
        "Teacher", "Tutor", "Academic Counsellor", "Instructional Designer", "Curriculum Developer", "Teaching Assistant",
        "Subject Matter Expert", "Education Consultant", "Lecturer"]},
    {"key": "healthcare", "label": "Healthcare", "roles": [
        "Staff Nurse", "Medical Officer", "Pharmacist", "Clinical Research Associate", "Medical Coder", "Physiotherapist",
        "Lab Technician", "Healthcare Administrator", "Medical Writer", "Clinical Data Analyst"]},
]

FIELD_BY_KEY = {f["key"]: f for f in FIELDS}
