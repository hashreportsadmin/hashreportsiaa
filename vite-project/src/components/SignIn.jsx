import React from 'react';
import { ContactFooter } from './ContactFooter';
import { BackgroundShapes, LogoHeader, Popup, ValidatedInput } from './SharedUI';
import { Welcome } from './Welcome';
import { dbCreateObject, dbListObjects } from '../utils/db';
import { formatRegNumber } from '../utils/formatters';

const CAMPUS_LOGOS = {
    UDOM: "https://app.trickle.so/storage/public/images/usr_1859567910000001/e442c661-c8dc-40b5-8f6d-2dc2e2497c18.jpeg",
    IAA: "https://app.trickle.so/storage/public/images/usr_1859567910000001/27226368-effa-494d-a50f-83a133f788f4.jpeg"
};

// Works out which campus tab should be selected when the sign-in screen
// first opens: a university just chosen on the sign-up screen wins (most
// specific/freshest signal), otherwise whichever campus the person last
// successfully signed in with, otherwise UDOM.
const getInitialCampus = () => {
    const fromSignup = sessionStorage.getItem('signupUniversity');
    if (fromSignup === 'IAA' || fromSignup === 'UDOM') return fromSignup;
    const lastCampus = localStorage.getItem('lastCampus');
    return lastCampus === 'IAA' ? 'IAA' : 'UDOM';
};

const SignIn = ({ onNavigate, onLoginSuccess }) => {
    // 'UDOM' (default, formatted TXX-XX-XXXXX) or 'IAA' (free-format number)
    const [campus, setCampus] = React.useState(getInitialCampus);
    const isIAA = campus === 'IAA';
    // The Forgot Password popup has its own UDOM / IAA choice
    const [forgotCampus, setForgotCampus] = React.useState(getInitialCampus);
    const forgotIsIAA = forgotCampus === 'IAA';
    const [regNumber, setRegNumber] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const [loginStatus, setLoginStatus] = React.useState('idle');
    const [showPopup, setShowPopup] = React.useState(false);
    const [popupContent, setPopupContent] = React.useState({ title: '', message: '', type: 'info', icon: '' });

    // Forgot Password states
    const [showForgotModal, setShowForgotModal] = React.useState(false);
    const [forgotRegNumber, setForgotRegNumber] = React.useState('');

    const [usersDb, setUsersDb] = React.useState([]);

    const isKnownReg = (v) => {
        if (usersDb.some(u => u.regNumber === v && !u.deleted)) return true;
        try {
            const cu = JSON.parse(localStorage.getItem('currentUser'));
            return !!(cu && cu.regNumber === v && !cu.deleted);
        } catch (e) { return false; }
    };

    const valReg = (v) => {
        if (isIAA) {
            if (!v || !v.trim()) return "Registration Number is required";
            return isKnownReg(v) ? null : "Registration Number not found";
        }
        if (!v || v === 'T') return "Registration Number is required";
        if (v.length !== 12) return "Format: TXX-XX-XXXXX";
        return null;
    };

    React.useEffect(() => {
        // One-time signal: already consumed by getInitialCampus() above to
        // pick the starting tab, so it shouldn't linger and affect a later
        // visit to this screen (which should fall back to lastCampus).
        sessionStorage.removeItem('signupUniversity');

        const prefillReg = sessionStorage.getItem('prefillRegNumber');
        if (prefillReg) {
            if (!/^T[0-9-]*$/i.test(prefillReg)) setCampus('IAA');
            setRegNumber(prefillReg);
            sessionStorage.removeItem('prefillRegNumber');
            setTimeout(() => {
                const passInput = document.getElementById('signin-pass');
                if (passInput) passInput.focus();
            }, 300);
        }

        const fetchUsers = async () => {
            try {
                const res = await dbListObjects('user', 1000, false);
                setUsersDb(res.items.map(i => i.objectData));
            } catch (e) {
                console.error(e);
            }
        };
        fetchUsers();
    }, []);

    const valPass = (v) => {
        if (!v) return "Password is required";
        const user = usersDb.find(u => u.regNumber === regNumber && !u.deleted);
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        
        if (user && user.password === v) return null;
        if (currentUser && currentUser.regNumber === regNumber && currentUser.password === v && !currentUser.deleted) return null;
        
        return "Password is incorrect";
    };

    const valForgotReg = (v) => {
        if (forgotIsIAA) return v && v.trim() ? null : "Registration Number is required";
        if (!v || v === 'T') return "Registration Number is required";
        if (v.length !== 12) return "Format: TXX-XX-XXXXX";
        return null;
    };

    const handleForgotCampusChange = (next) => {
        if (next === forgotCampus) return;
        setForgotCampus(next);
        setForgotRegNumber('');
    };

    const openForgotModal = () => {
        setForgotCampus(campus);
        setForgotRegNumber('');
        setShowForgotModal(true);
    };

    const handleCampusChange = (next) => {
        if (next === campus) return;
        setCampus(next);
        setRegNumber('');
        setPassword('');
        setForgotRegNumber('');
        setLoginStatus('idle');
    };

    const handleRegChange = (val) => {
        if (isIAA) {
            setRegNumber(val);
            setLoginStatus('idle');
            if (isKnownReg(val)) {
                setTimeout(() => document.getElementById('signin-pass')?.focus(), 50);
            }
            return;
        }
        const formatted = formatRegNumber(val, regNumber);
        setRegNumber(formatted);
        setLoginStatus('idle');

        if (formatted.length === 12) {
            if (document.activeElement) document.activeElement.blur();
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => input.blur());

            const userFound = checkRegistration(formatted, false);
            if (userFound && !valReg(formatted)) {
                setTimeout(() => document.getElementById('signin-pass')?.focus(), 50);
            }
        }
    };

    const checkRegistration = (regToVerify, fromForgot) => {
        const user = usersDb.find(u => u.regNumber === regToVerify && !u.deleted);
        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        
        if (!user && (!currentUser || currentUser.regNumber !== regToVerify || currentUser.deleted)) {
            if (document.activeElement) document.activeElement.blur();
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => input.blur());
            
            setPopupContent({
                title: "Not Registered",
                message: "This Registration Number is Not Registered in Our System, Sign Up to Create your Account",
                type: fromForgot ? "not-found-forgot" : "not-found",
                icon: "🚫"
            });
            setShowPopup(true);
            return null;
        }
        return user || currentUser;
    };

    const handleSignIn = () => {
        setIsLoading(true);
        setTimeout(() => {
            setIsLoading(false);
            const user = usersDb.find(u => u.regNumber === regNumber && !u.deleted) || JSON.parse(localStorage.getItem('currentUser'));
            if (user && !user.deleted) {
                localStorage.setItem('currentUser', JSON.stringify(user));
            }
            // Remember which campus this login used, so it's the default
            // tab selected next time this screen opens.
            localStorage.setItem('lastCampus', campus);
            // Clear any saved inner screen states to always land on Home
            sessionStorage.removeItem('showNotificationsScreen');
            sessionStorage.removeItem('showProfileScreen');
            sessionStorage.removeItem('viewingOrderId');
            
            onLoginSuccess('student');
        }, 1000);
    };

    const handleForgotRegChange = (val) => {
        setForgotRegNumber(forgotIsIAA ? val : formatRegNumber(val, forgotRegNumber));
    };

    const handleRequestPassword = async () => {
        if (valForgotReg(forgotRegNumber)) return;
        
        const user = checkRegistration(forgotRegNumber, true);
        if (user) {
            setIsLoading(true);
            try {
                const reqRes = await dbListObjects('password_request', 1000, false);
                const existingRequests = reqRes.items;
                const firstName = user.fullName.split(' ')[0];
                
                const pendingRequest = existingRequests.find(r => r.objectData.regNumber === forgotRegNumber && r.objectData.status === 'pending');
                
                if (pendingRequest) {
                    setPopupContent({
                        title: "Request Pending",
                        message: `Hellow ${firstName}, You already requested a password. Please wait for admin approval and you will receive your password on your email and phone number.`,
                        type: 'info-close-all',
                        icon: '⏳'
                    });
                    setShowPopup(true);
                } else {
                    await dbCreateObject('password_request', {
                        regNumber: forgotRegNumber,
                        status: 'pending'
                    });
                    
                    setPopupContent({
                        title: "Request Successful",
                        message: `Hellow ${firstName}, Your Password Request is successful. Wait for admin approval and you will receive your password in your email and phone number. Don't request again until you receive your password please. Thank You.`,
                        type: 'info-close-all',
                        icon: '✅'
                    });
                    setShowPopup(true);
                }
            } catch (error) {
                console.error(error);
                setPopupContent({ title: "Error", message: "Could not process request. Please try again.", type: "error", icon: "❌" });
                setShowPopup(true);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const closePopup = () => {
        const type = popupContent.type;
        setShowPopup(false);
        if (type === 'not-found') {
            setRegNumber(isIAA ? '' : 'T');
        } else if (type === 'not-found-forgot') {
            setForgotRegNumber(forgotIsIAA ? '' : 'T');
        } else if (type === 'info-close-all') {
            setShowForgotModal(false);
            setForgotRegNumber('');
        }
    };

    const confirmPopup = () => {
        const type = popupContent.type;
        setShowPopup(false);
        if (type === 'not-found' || type === 'not-found-forgot') {
            onNavigate('signup');
        } else if (type === 'info-close-all') {
            setShowForgotModal(false);
            setForgotRegNumber('');
        }
    };

    const isValid = !valReg(regNumber) && !valPass(password);

    React.useEffect(() => {
        if (isValid && document.activeElement && document.activeElement.tagName === 'INPUT') {
            document.activeElement.blur();
        }
    }, [isValid]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col p-6 relative overflow-hidden" data-name="signin" data-file="components/SignIn.js">
            <BackgroundShapes />
            
            <div className="w-full max-w-md md:max-w-4xl mx-auto relative z-10 flex flex-col md:flex-row md:items-center md:gap-12 pt-10 md:pt-4 h-full md:h-auto md:min-h-[70vh] md:mt-12">
                
                {/* Left Side (PC) / Top (Mobile) */}
                <div className="md:w-1/2 flex flex-col justify-center">
                    <LogoHeader />
                    
                    <div className="hidden md:block mt-8 text-center px-4">
                        <div className="w-24 h-24 mx-auto bg-[var(--primary-light)] rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <div className="icon-user-round text-5xl text-[var(--primary-color)]"></div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Welcome Back, Student!</h3>
                        <p className="text-gray-600 leading-relaxed text-sm">
                            Access your portal to track your field report status, view research orders, and connect with your university authorities securely.
                        </p>
                    </div>
                </div>

                {/* Right Side (PC) / Bottom (Mobile) */}
                <div className="md:w-1/2">
                    <div className="glass-card p-5 md:p-8 mt-2 md:mt-0 shadow-2xl relative z-20">
                    <div className="flex items-center justify-between gap-2 mb-6">
                        <div className="flex items-center gap-2">
                            <div className="icon-log-in text-xl md:text-2xl text-[var(--primary-color)]"></div>
                            <h1 className="text-xl md:text-2xl font-bold text-[var(--primary-color)]">Sign In</h1>
                        </div>
                        <div className="flex gap-1.5 ml-auto">
                            {['UDOM', 'IAA'].map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => handleCampusChange(c)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-bold transition-colors ${campus === c ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white shadow-sm' : 'bg-white/60 border-gray-300 text-gray-600 hover:border-[var(--primary-color)]'}`}
                                >
                                    <img src={CAMPUS_LOGOS[c]} alt={c} className="w-4 h-4 rounded-full object-cover bg-white" />
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3 md:space-y-5">
                        {isIAA ? (
                            <ValidatedInput 
                                key="signin-reg-iaa"
                                id="signin-reg"
                                label="Registration Number" 
                                placeholder="BA/0000/2026"
                                value={regNumber}
                                autoComplete="new-password"
                                onChange={(e) => handleRegChange(e.target.value)}
                                onBlur={() => {
                                    if (regNumber.trim() && usersDb.length > 0 && !isKnownReg(regNumber)) {
                                        setPopupContent({
                                            title: "Not Registered",
                                            message: "This Registration Number is Not Registered in Our System, Sign Up to Create your Account",
                                            type: "not-found",
                                            icon: "🚫"
                                        });
                                        setShowPopup(true);
                                    }
                                }}
                                validate={valReg}
                            />
                        ) : (
                            <ValidatedInput 
                                key="signin-reg-udom"
                                id="signin-reg"
                                label="Registration Number" 
                                placeholder="TXX-XX-XXXXX"
                                className="tracking-wider"
                                value={regNumber}
                                autoComplete="new-password"
                                onClick={() => !regNumber && setRegNumber('T')}
                                onChange={(e) => handleRegChange(e.target.value)}
                                validate={valReg}
                            />
                        )}
                        
                        <ValidatedInput 
                            id="signin-pass"
                            label="Password" 
                            placeholder="Enter your password"
                            type="password"
                            showEye={true}
                            autoComplete="new-password"
                            disabled={!!valReg(regNumber)}
                            value={password}
                            onChange={(e) => {
                                setPassword(e.target.value);
                                setLoginStatus('idle');
                            }}
                            validate={valPass}
                        />
                    </div>

                    <div className="text-right mt-3 mb-4">
                        <button onClick={openForgotModal} className="text-sm font-semibold text-[var(--primary-color)] hover:text-[var(--primary-dark)] transition-colors">
                            Forgot Password?
                        </button>
                    </div>

                    <button onClick={handleSignIn} disabled={!isValid || isLoading}
                        className="btn-primary w-full shadow-lg shadow-[var(--primary-light)]">
                        {isLoading ? <div className="icon-loader animate-spin mr-2"></div> : null}
                        SIGN IN
                    </button>

                    <div className="mt-4 text-center flex flex-col gap-2">
                        <p className="text-gray-600 font-medium text-sm">
                            Don't have an Account? <button onClick={() => onNavigate('signup')} className="font-bold text-[var(--primary-color)] hover:text-[var(--primary-dark)] transition-colors ml-1">Sign Up</button>
                        </p>
                        <p className="text-gray-600 font-medium text-sm">
                            Are you an admin? <button onClick={() => onNavigate('admin-signin')} className="font-bold text-[var(--primary-color)] hover:text-[var(--primary-dark)] transition-colors ml-1">Sign In</button>
                        </p>
                    </div>
                </div>
                </div>
            </div>

            <ContactFooter />

            {/* Forgot Password Modal */}
            {showForgotModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in-up border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <div className="icon-key text-[var(--primary-color)]"></div> Recover Password
                            </h3>
                            <button onClick={() => setShowForgotModal(false)} className="text-gray-400 hover:text-gray-600">
                                <div className="icon-x text-xl"></div>
                            </button>
                        </div>
                        <div className="flex gap-2 mb-4">
                            {['UDOM', 'IAA'].map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => handleForgotCampusChange(c)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold transition-colors ${forgotCampus === c ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-white shadow-sm' : 'bg-white/60 border-gray-300 text-gray-600 hover:border-[var(--primary-color)]'}`}
                                >
                                    <img src={CAMPUS_LOGOS[c]} alt={c} className="w-5 h-5 rounded-full object-cover bg-white" />
                                    {c}
                                </button>
                            ))}
                        </div>
                        <p className="text-sm text-gray-600 mb-5">Enter your registration number to request your password.</p>
                        
                        <div className="mb-6">
                            <ValidatedInput 
                                key={forgotIsIAA ? 'forgot-iaa' : 'forgot-udom'}
                                label="Registration Number" 
                                placeholder={forgotIsIAA ? "BA/0000/2026" : "TXX-XX-XXXXX"}
                                className={forgotIsIAA ? "" : "tracking-wider"}
                                value={forgotRegNumber}
                                onClick={() => !forgotIsIAA && !forgotRegNumber && setForgotRegNumber('T')}
                                onChange={(e) => handleForgotRegChange(e.target.value)}
                                validate={valForgotReg}
                            />
                        </div>
                        
                        <button 
                            onClick={handleRequestPassword}
                            disabled={!forgotRegNumber || !!valForgotReg(forgotRegNumber)}
                            className="btn-primary w-full shadow-md py-2.5">
                            REQUEST PASSWORD
                        </button>
                    </div>
                </div>
            )}

            <Popup 
                isOpen={showPopup} 
                title={popupContent.title} 
                message={popupContent.message}
                icon={popupContent.icon}
                onConfirm={confirmPopup} 
                confirmText={popupContent.type.includes('not-found') ? 'SIGN UP' : 'OKAY'}
                onCancel={popupContent.type.includes('not-found') ? closePopup : undefined}
                cancelText="CANCEL"
            />
        </div>
    );
};

export { SignIn };
export default SignIn;
