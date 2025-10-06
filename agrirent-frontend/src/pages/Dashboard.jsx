import { useState, useEffect } from "react";
import {
  Tractor,
  Calendar,
  User,
  Home,
  Search,
  Plus,
  Star,
  TrendingUp,
  Package,
} from "lucide-react";
import { machineAPI, rentalAPI, uploadAPI } from "../services/api";
import BookingModal from '../components/BookingModal';
export default function Dashboard({ user: currentUser, onLogout }) {

  const [currentView, setCurrentView] = useState("home");
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [showAddMachineForm, setShowAddMachineForm] = useState(false);

  const [machines, setMachines] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [loadingRentals, setLoadingRentals] = useState(false);

  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingMachine, setBookingMachine] = useState(null);

  useEffect(() => {
    fetchMachines();
    fetchRentals();
  }, []);

  const fetchMachines = async () => {
    setLoadingMachines(true);
    try {
      const response = await machineAPI.getAll();
      if (response.data.success) {
        setMachines(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching machines:", error);
    } finally {
      setLoadingMachines(false);
    }
  };

  const fetchRentals = async () => {
    setLoadingRentals(true);
    try {
      const response = await rentalAPI.getAll();
      if (response.data.success) {
        setRentals(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching rentals:", error);
    } finally {
      setLoadingRentals(false);
    }
  };

  const handleBookMachine = async (bookingData) => {
  try {
    const response = await rentalAPI.create({
      machineId: bookingMachine._id,
      ...bookingData
    });
    
    if (response.data.success) {
      alert('Booking request sent successfully!');
      await fetchRentals();
      setShowBookingModal(false);
      setBookingMachine(null);
    }
  } catch (error) {
    throw error;
  }
};

  const isOwner = currentUser?.role === "owner" || currentUser?.role === "both";

  const VerificationBanner = ({ user }) => {
    if (!user || user.isEmailVerified) return null;
    if (user.role !== "owner" && user.role !== "both") return null;

    const handleResendEmail = async () => {
      try {
        const response = await fetch(
          "http://localhost:3001/api/auth/resend-verification",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email }),
          }
        );
        const data = await response.json();
        alert(data.message);
      } catch (err) {
        alert("Failed to resend email");
      }
    };

    return (
      <div className="bg-amber-100 border-l-4 border-amber-500 text-amber-800 p-4 m-4 rounded-lg">
        <p className="font-semibold">Email Verification Required</p>
        <p className="text-sm mt-1">
          You must verify your email before you can list equipment for rent.
        </p>
        <button
          onClick={handleResendEmail}
          className="mt-3 text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition"
        >
          Resend verification email
        </button>
      </div>
    );
  };

  const HomeScreen = () => {
    const activeMachines = machines.filter((m) => m.isActive).length;
    const activeRentals = rentals.filter((r) => r.status === "active").length;

    return (
      <div className="p-6">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 bg-clip-text text-transparent mb-2">
          Welcome, {currentUser?.firstName}!
        </h2>
        <p className="text-gray-600 mb-8">
          Find and rent agricultural equipment
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg">
            <Package size={28} className="opacity-80 mb-2" />
            <p className="text-blue-100 text-sm">Total Machines</p>
            <p className="text-3xl font-bold">{activeMachines}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <TrendingUp size={28} className="opacity-80 mb-2" />
            <p className="text-emerald-100 text-sm">Active Rentals</p>
            <p className="text-3xl font-bold">{activeRentals}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setCurrentView("machines")}
            className="bg-gradient-to-br from-blue-500 to-cyan-500 p-5 rounded-2xl shadow-lg flex flex-col items-center gap-3 hover:scale-105 transition text-white"
          >
            <Search size={28} />
            <span className="text-sm font-semibold">Browse Machines</span>
          </button>
          <button
            onClick={() => setCurrentView("rentals")}
            className="bg-gradient-to-br from-teal-500 to-emerald-500 p-5 rounded-2xl shadow-lg flex flex-col items-center gap-3 hover:scale-105 transition text-white"
          >
            <Calendar size={28} />
            <span className="text-sm font-semibold">My Rentals</span>
          </button>
          {isOwner && (
            <button
              onClick={() => setShowAddMachineForm(true)}
              className="bg-gradient-to-br from-amber-500 to-orange-500 p-5 rounded-2xl shadow-lg flex flex-col items-center gap-3 hover:scale-105 transition text-white"
            >
              <Plus size={28} />
              <span className="text-sm font-semibold">Add Machine</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const MachinesScreen = () => {
    const filteredMachines =
      selectedFilter === "All"
        ? machines
        : machines.filter((m) => m.category === selectedFilter);

    if (loadingMachines) {
      return (
        <div className="p-4 flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading machines...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Available Machines
          </h1>
          {isOwner && (
            <button
              onClick={() => setShowAddMachineForm(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-3 rounded-xl shadow-lg hover:shadow-xl transition"
            >
              <Plus size={20} />
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl p-3 mb-4 shadow-md flex gap-2 overflow-x-auto">
          {["All", "tractor", "harvester", "planter"].map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`px-5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition capitalize ${
                selectedFilter === filter
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {filter === "All" ? "All" : `${filter}s`}
            </button>
          ))}
        </div>

        {filteredMachines.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-lg">
            <Tractor size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No machines found</p>
            {isOwner && (
              <button
                onClick={() => setShowAddMachineForm(true)}
                className="mt-4 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-semibold"
              >
                Add Your First Machine
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMachines.map((machine) => (
              <div
                key={machine._id}
                onClick={() => {
                  setSelectedMachine(machine);
                  setCurrentView("machineDetail");
                }}
                className="bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer hover:shadow-2xl transition hover:scale-[1.02]"
              >
                <div className="relative">
                  <img
                    src={
                      machine.images?.[0] ||
                      "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"
                    }
                    alt={machine.name}
                    className="w-full h-48 object-cover"
                  />
                  <span
                    className={`absolute top-3 right-3 px-4 py-2 rounded-xl text-xs font-bold shadow-lg ${
                      machine.availability === "available"
                        ? "bg-emerald-500 text-white"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {machine.availability}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-bold text-gray-800">
                    {machine.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 capitalize">
                    {machine.category} • {machine.brand}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <Star size={16} className="text-amber-400 fill-amber-400" />
                    <span className="text-sm font-semibold">
                      {machine.rating?.average || 0}
                    </span>
                    <span className="text-sm text-gray-500 ml-1">
                      • {machine.address?.city || "Location N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                      ${machine.pricePerDay}/day
                    </span>
                    <span className="text-sm text-gray-600 font-medium">
                      {machine.specifications?.horsepower || 0} HP
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

const MachineDetailScreen = () => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!selectedMachine) return null;

  const images =
    selectedMachine.images && selectedMachine.images.length > 0
      ? selectedMachine.images
      : ["https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex(
      (prev) => (prev - 1 + images.length) % images.length
    );
  };

  const isOwnMachine = selectedMachine.ownerId?._id === currentUser?.id || 
                        selectedMachine.ownerId === currentUser?.id;

  return (
    <div className="p-4">
      <button
        onClick={() => setCurrentView("machines")}
        className="mb-4 text-blue-600 font-semibold"
      >
        ← Back
      </button>

      {/* Image carousel - keep existing code */}
      <div className="relative mb-4">
        {/* ... existing carousel code ... */}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {/* ... existing thumbnails code ... */}
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 shadow-lg">
        <h1 className="text-2xl font-bold">{selectedMachine.name}</h1>
        <p className="text-gray-600 capitalize">
          {selectedMachine.brand} • {selectedMachine.year}
        </p>
        {selectedMachine.description && (
          <p className="text-gray-600 mt-3">{selectedMachine.description}</p>
        )}
        <div className="mt-4">
          <div className="flex items-center gap-1 mb-4">
            <Star size={20} className="text-amber-400 fill-amber-400" />
            <span className="font-semibold">
              {selectedMachine.rating?.average || 0}
            </span>
          </div>
          <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            ${selectedMachine.pricePerDay}/day
          </div>
          <p className="text-gray-600 mt-2">
            {selectedMachine.specifications?.horsepower || 0} HP
          </p>
        </div>

        {/* Book Now Button */}
        {!isOwnMachine && selectedMachine.availability === 'available' && (
          <button
            onClick={() => {
              setBookingMachine(selectedMachine);
              setShowBookingModal(true);
            }}
            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 rounded-xl font-bold hover:shadow-xl transition"
          >
            Book Now
          </button>
        )}

        {isOwnMachine && (
          <div className="mt-6 bg-blue-50 text-blue-700 p-4 rounded-xl text-center">
            This is your machine
          </div>
        )}

        {selectedMachine.availability !== 'available' && !isOwnMachine && (
          <div className="mt-6 bg-gray-100 text-gray-600 p-4 rounded-xl text-center">
            Currently unavailable
          </div>
        )}
      </div>
    </div>
  );
};

  const RentalsScreen = () => {
    if (loadingRentals) {
      return (
        <div className="p-4 flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading rentals...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          My Rentals
        </h1>
        {rentals.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <Calendar size={48} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-600">No rentals yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rentals.map((rental) => (
              <div
                key={rental._id}
                className="bg-white rounded-2xl p-5 shadow-lg"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold">
                      {rental.machineId?.name || "Machine"}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Status: {rental.status}
                    </p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-xl text-xs font-bold capitalize ${
                      rental.status === "active"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {rental.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Start: {new Date(rental.startDate).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600">
                  End: {new Date(rental.endDate).toLocaleDateString()}
                </p>
                <p className="text-lg font-bold mt-2 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                  ${rental.pricing?.totalPrice || 0}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ProfileScreen = () => (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
        Profile
      </h1>
      <div className="bg-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {currentUser?.firstName?.charAt(0)}
            {currentUser?.lastName?.charAt(0)}
          </div>
          <div>
            <h3 className="text-xl font-bold">
              {currentUser?.firstName} {currentUser?.lastName}
            </h3>
            <p className="text-gray-600">{currentUser?.email}</p>
            <p className="text-sm text-gray-500 capitalize mt-1">
              Role: {currentUser?.role}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 transition"
        >
          Log Out
        </button>
      </div>
    </div>
  );

  const AddMachineForm = () => {
    const [formData, setFormData] = useState({
      name: "",
      category: "",
      brand: "",
      year: "",
      pricePerDay: "",
      horsepower: "",
      description: "",
    });
    const [imageFiles, setImageFiles] = useState([]);
    const [localUploadedImages, setLocalUploadedImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleChange = (e) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleImageUpload = (e) => {
      const files = Array.from(e.target.files);
      setImageFiles([...imageFiles, ...files]);

      const previewUrls = files.map((file) => URL.createObjectURL(file));
      setLocalUploadedImages([...localUploadedImages, ...previewUrls]);
    };

    const removeImage = (index) => {
      setImageFiles(imageFiles.filter((_, i) => i !== index));
      setLocalUploadedImages(localUploadedImages.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setError("");

      try {
        let imageUrls = [];
        if (imageFiles.length > 0) {
          const uploadResponse = await uploadAPI.uploadImages(imageFiles);
          imageUrls = uploadResponse.data.images.map((img) => img.url);
        }

        const machineData = {
          name: formData.name,
          category: formData.category.toLowerCase(),
          brand: formData.brand,
          year: parseInt(formData.year),
          pricePerDay: parseFloat(formData.pricePerDay),
          specifications: {
            horsepower: parseInt(formData.horsepower || 0),
          },
          description: formData.description,
          location: {
            type: "Point",
            coordinates: [-79.5, 43.8],
          },
          address: {
            city: "Vaughan",
            state: "ON",
          },
          images:
            imageUrls.length > 0
              ? imageUrls
              : ["https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400"],
        };

        const response = await machineAPI.create(machineData);

        if (response.data.success) {
          setShowAddMachineForm(false);
          setLocalUploadedImages([]);
          setImageFiles([]);
          await fetchMachines();
          setCurrentView("machines");
          alert("Machine added successfully!");
        }
      } catch (err) {
        console.error("Error adding machine:", err);
        setError(err.response?.data?.message || "Failed to add machine");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full my-8 shadow-2xl">
          <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Add New Machine
          </h2>

          {error && (
            <div className="bg-rose-100 border border-rose-300 text-rose-700 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="space-y-4 max-h-96 overflow-y-auto pr-2"
          >
            <div>
              <label className="block text-sm font-semibold mb-2">
                Machine Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., John Deere 8R 370"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Category</option>
                <option value="tractor">Tractor</option>
                <option value="harvester">Harvester</option>
                <option value="planter">Planter</option>
                <option value="desouche">Desoucheuse</option>
                <option value="sprayer">Sprayer</option>
                <option value="cultivator">Cultivator</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Brand *
                </label>
                <input
                  type="text"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  required
                  placeholder="John Deere"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Year *
                </label>
                <input
                  type="number"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  required
                  placeholder="2024"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Horsepower
              </label>
              <input
                type="number"
                name="horsepower"
                value={formData.horsepower}
                onChange={handleChange}
                placeholder="370"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Price per Day ($) *
              </label>
              <input
                type="number"
                name="pricePerDay"
                value={formData.pricePerDay}
                onChange={handleChange}
                required
                placeholder="450"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your machine..."
                rows="3"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Upload Images
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                id="imageUpload"
              />
              <label
                htmlFor="imageUpload"
                className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition block"
              >
                <Plus size={32} className="mx-auto text-blue-400 mb-2" />
                <p className="text-sm text-gray-600">Click to upload images</p>
              </label>

              {localUploadedImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {localUploadedImages.map((img, idx) => (
                    <div key={idx} className="relative">
                      <img
                        src={img}
                        alt={`Preview ${idx}`}
                        className="w-full h-20 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowAddMachineForm(false);
                  setLocalUploadedImages([]);
                  setImageFiles([]);
                }}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {loading ? "Saving..." : "Add Machine"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gradient-to-br from-gray-50 to-blue-50 min-h-screen pb-20 max-w-md mx-auto">
      <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 text-white p-5 shadow-xl">
        <h1 className="text-2xl font-bold">AgriRent</h1>
        <p className="text-sm text-blue-100">Location d'equipement Agricole</p>
      </div>

    {showAddMachineForm && <AddMachineForm />}
    {showBookingModal && bookingMachine && (
      <BookingModal
        machine={bookingMachine}
        onClose={() => {
          setShowBookingModal(false);
          setBookingMachine(null);
        }}
        onBook={handleBookMachine}
      />
    )}
    
      <VerificationBanner user={currentUser} />

      {currentView === "home" && <HomeScreen />}
      {currentView === "machines" && <MachinesScreen />}
      {currentView === "machineDetail" && <MachineDetailScreen />}
      {currentView === "rentals" && <RentalsScreen />}
      {currentView === "profile" && <ProfileScreen />}

       {showAddMachineForm && <AddMachineForm />}

      <div className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t px-4 py-3 flex justify-around shadow-lg max-w-md mx-auto">
        <button
          onClick={() => setCurrentView("home")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "home" ? "text-blue-600" : "text-gray-400"
          }`}
        >
          <Home size={24} />
          <span className="text-xs">Home</span>
        </button>
        <button
          onClick={() => setCurrentView("machines")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "machines" || currentView === "machineDetail"
              ? "text-cyan-600"
              : "text-gray-400"
          }`}
        >
          <Search size={24} />
          <span className="text-xs">Browse</span>
        </button>
        <button
          onClick={() => setCurrentView("rentals")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "rentals" ? "text-teal-600" : "text-gray-400"
          }`}
        >
          <Calendar size={24} />
          <span className="text-xs">Rentals</span>
        </button>
        <button
          onClick={() => setCurrentView("profile")}
          className={`flex flex-col items-center gap-1 p-2 ${
            currentView === "profile" ? "text-emerald-600" : "text-gray-400"
          }`}
        >
          <User size={24} />
          <span className="text-xs">Profile</span>
        </button>
      </div>
    </div>
  );
}
